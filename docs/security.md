# Security

> **Status:** In review
> **Owner:** KCLUB Delivery Lead
> **Last updated:** 2026-08-19
> **Write when:** before the first production deploy — §1 and §4 sooner.

What we protect, who we protect it from, and the concrete measures in place.
Security is a property of the whole system — this document should be read
alongside [architecture.md](architecture.md) and
[data-storage.md](data-storage.md).

---

## 1. Threat model

**Assets worth protecting, ranked:**

1. **The member list itself.** Not any individual field — the fact that a
   specific set of people belongs to this club. The product's promise is that
   this set is never disclosed, so a leak of nothing but names and phone numbers
   is a total product failure, not a routine breach.
2. **Phone numbers**, which are both the identifier and the recovery channel.
   One leaked number is a nuisance; the mapping "this number belongs to a KCLUB
   member" is the asset above in another form.
3. **Referral client contact details** — personal data about people who are not
   our users and never agreed to anything with us.
4. **Staff console access**, which can publish, unpublish, block, revoke and
   reprice. Compromise here is compromise of everything below it.
5. **Recurring revenue integrity** — the ability to obtain a paid entitlement
   without paying, or to cause a charge that should not have happened.
6. **Availability of the card verification page**, because a partner refusing a
   real member at a counter is the most visible possible failure.

|Threat|Actor|Impact|Likelihood|Mitigation|
|-|-|-|-|-|
|Enumerating members through the card verification page|External, automated|Catastrophic — reconstructs the member list|H|Opaque 128-bit token, not derived from any identifier; 30 lookups/IP/minute; no listing endpoint; `noindex`; the response is identical in shape for valid, revoked and unknown tokens|
|SMS pumping: cycling premium-rate numbers to earn revenue share|External, automated|Financial — thousands of dollars in hours|H|Twilio Verify Fraud Guard; per-number, per-IP and global hourly ceilings; geographic permissions restricted to expected destinations; a hard daily spend cap with an alert at 50%|
|Credential stuffing against member sign-in|External, automated|Account takeover|H|argon2id hashing; per-account and per-IP throttling with exponential lockout; breached-password check against a k-anonymity API at set time; step-up SMS challenge from an unrecognised device|
|SIM swap / number recycling|External, targeted|Account takeover, and support-driven takeover is the easier path|M|Password required in addition to the number — SMS alone never signs anyone in; step-up challenge on device change; sensitive changes (phone, password) notify the old channel; a written support recovery procedure with fixed identity proof (an open question in [requirements.md §9](requirements.md#9-open-questions))|
|Forged or replayed Stripe webhook granting a free entitlement|External|Revenue loss, and worse if scripted|M|Signature verification with the endpoint secret before parsing; event id as primary key; entitlement derived only from re-fetched Stripe objects, never from webhook payload fields alone|
|Staff account compromise|External via phishing|Total|M|Mandatory TOTP; separate identity from member accounts; separate hostname; short sessions with re-authentication for destructive actions; every action audited to an append-only log the application cannot rewrite|
|Insider misuse — a support user browsing members out of curiosity|Insider|Privacy breach, reputational|M|Least-privilege roles (`staff_support` is read-only); every read of a member record by a staff user is audited, not only writes; quarterly access review|
|Broken object-level authorization (member A reads member B's company, subscription or referral)|External, authenticated|Privacy breach|M|Ownership filters applied inside repository functions rather than at call sites; an automated test enumerates every route with a second member's identifiers and asserts 404/403|
|Referral feature used for spam or harvesting|Member|Regulatory and reputational|M|VIP + published company required to send; quotas per sender and per recipient; moderation before delivery; contact details hidden until acceptance; staff can bar a sender|
|Denial of service / scraping of the catalogue|External|Availability, and partner data harvested|M|Catalogue is authenticated only; Vercel edge rate limits; per-account request budget; Cloudflare in front of DNS|
|Partner logo points at inappropriate or malicious content after moderation approves it|Member|Reputational; browser-side exposure to whatever the linked host serves|L|Partner logos are member-supplied external URLs, not files uploaded to KCLUB storage — the browser fetches them directly, never our server, so there is no server-side upload surface. Moderation reviews the URL's content at approval time only; a partner can swap the linked image afterwards, closed by a staff report rather than a technical control ([ADR 0013](decisions/0013-partner-logos-as-external-urls.md))|
|Supply-chain compromise of an npm dependency|External|Total, and quiet|L|Lockfile committed and verified; automated advisory scanning; a 3-day cool-off before adopting a brand-new major; CI has no access to production secrets|
|Backup exfiltration|External|Total|L|Backups in a separate vendor, region and credential set; additionally age-encrypted with a key held outside the cloud|

**Accepted risks.** Each is a decision, not an oversight:

- **No fraud detection on referrals beyond quotas and human moderation.** A
  determined member can submit fabricated referrals up to their quota. Accepted
  because the volume is small and human review catches patterns; revisit above
  200 referrals/day.
- **A single application-held key encrypts referral contact details.** Envelope
  encryption per record with a KMS would be better; accepted at launch because
  key rotation for one key is a solved problem and the volume is low.
- **A member who has been blocked can still be identified by trying to
  re-register their own number.** Preventing this would require an oracle-free
  registration flow that we do not have; the disclosure is to the number's owner
  only.
- **Logs are held by a third party (Axiom) for 30 days.** They carry internal
  ids, never phone numbers or names. Accepted and declared in the Privacy
  Policy.
- **No bug bounty at launch.** A responsible-disclosure address is published
  instead; a paid programme is disproportionate before there is anything to find
  at scale.
- **Single region.** A regional compromise or outage is total. Accepted per
  [architecture.md §7](architecture.md#7-known-limitations-and-technical-debt).

---

## 2. Authentication and authorization

Role names are identical to
[requirements.md §3](requirements.md#3-users-and-roles).

### Authentication

Members and staff authenticate through separate flows against separate tables —
see [decisions/0007-staff-identities-separate.md](decisions/0007-staff-identities-separate.md).

|Aspect|Approach|
|-|-|
|Method (member)|Phone number (E.164) + password. First registration additionally requires an SMS one-time code; later sign-ins require one only from an unrecognised device|
|Method (staff)|Email + password + **mandatory** TOTP. A staff account with no enrolled authenticator cannot complete sign-in, only enrolment|
|Password policy|Minimum 10 characters, no composition rules, no forced rotation, checked against Have I Been Pwned's k-anonymity range API. Length and breach-checking are what actually work; complexity rules produce `Password1!`|
|Password storage|argon2id, 64 MiB memory, 3 iterations, parallelism 4, 16-byte random salt. Parameters stored with the hash so they can be raised without invalidating existing credentials|
|One-time codes|Generated, delivered, expired and attempt-limited by Twilio Verify. We never store a code, so a database compromise cannot approve a verification|
|Multi-factor|Required for all staff roles. Available to members as TOTP (phase 2); the SMS step-up on a new device is the default protection at launch|
|Session mechanism|Opaque random session id in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie, with the session record in PostgreSQL. Not a JWT — the club must be able to kill a session in one second (FR-010), and a stateless token cannot be killed, only waited out|
|Session lifetime|Member: 30 days sliding, 90 days absolute. Staff: 8 hours sliding, 12 hours absolute, plus re-authentication for destructive actions (block a member, revoke a card, change a price, change staff roles)|
|Cookie scope|Member cookie is host-only on `kclub.com`; the staff cookie is host-only on `admin.kclub.com`. Neither is set on a parent domain, so one cannot be replayed against the other|
|Revocation|Deleting the session row ends it at the next request. Blocking a member, changing a password or reissuing a card revokes every session for that principal immediately|
|Service-to-service|None internally — one deployment. Outbound calls authenticate with per-vendor API keys; inbound webhooks authenticate by signature, never by a shared secret in a URL|

### Authorization

**Model:** role-based, with ownership checks layered on top. Role decides
_which kinds of thing_ you may act on; ownership decides _which instances_.
Nearly every real authorization bug in a product like this is an ownership bug,
so ownership is enforced where it cannot be forgotten — inside the repository
functions, which take the actor and apply the filter themselves.

**Where it is enforced:** on the server, at the top of every domain use case,
by an explicit `assertCan(actor, action, subject)`. A Server Action is a public
HTTP endpoint and is treated as one. Hiding a button is presentation, not
authorization; middleware that gates a URL prefix is defence in depth, not the
control. The staff console's route prefix check and the per-use-case check are
both present, and the second is the one that counts.

|Role|May do|May not do|
|-|-|-|
|`guest`|Read marketing, legal and showcase content; verify a card by token; register|See the catalogue, any member, or any company not in the curated showcase|
|`member`|Read the catalogue; read and edit their own profile, card, companies and subscriptions|Send referrals; see any other member; see unpublished companies; see any subscription but their own|
|`member_vip`|Everything `member` may, plus send referrals within quota|Bypass quotas; see the recipient's private notes on a referral|
|`partner_owner`|Edit their own company; accept or decline referrals addressed to it|Publish their own company; set their own showcase rank; see referrals addressed elsewhere|
|`staff_support`|Read members, cards, subscriptions, payments, moderation history, audit log entries about their own actions|Any mutation whatsoever; export data; see referral client contact details|
|`staff_moderator`|Everything `staff_support` may, plus approve/reject companies and referrals, and manage categories, countries and cities|Block members; revoke cards; touch billing; see full payment details|
|`staff_admin`|Everything `staff_moderator` may, plus block/unblock members, revoke/reissue cards, publish/hide companies, set discounts and ranks, read finance dashboards|Manage staff accounts; change prices; approve an erasure request; read the full audit log|
|`staff_owner`|Everything|Nothing — which is why the role has two people at most, mandatory TOTP, and every action audited|
|`system`|Grant and revoke entitlements, publish and unpublish on billing state, expire referrals, run reconciliation|Act on behalf of a named staff user. System actions are attributed to `system` in the audit log, never to a person|

Two structural rules that outrank the table:

- **No endpoint returns a set of members to a member-level role.** There is no
  repository function that can. Enforced by a test that walks the whole route
  table ([decisions/0005-no-member-directory.md](decisions/0005-no-member-directory.md)).
- **A staff user cannot change their own role or re-enable their own disabled
  account.** Privilege escalation by self-edit is the cheapest attack on a
  console and the cheapest to close.

---

## 3. Data protection

|Class|Examples|At rest|In transit|Who may access|
|-|-|-|-|-|
|Public|Marketing copy, legal documents, curated showcase entries|Not encrypted beyond disk encryption|TLS|Everyone|
|Internal|Categories, countries, cities, aggregate counts, plan prices|Disk encryption|TLS|Any authenticated principal|
|Confidential — member PII|Phone number, display name, country, card serial, session records, IP addresses|AES-256 at rest (Neon); phone number additionally indexed by a keyed hash so lookups do not require scanning plaintext|TLS 1.3|The owning member; `staff_support` and above through the console; never a third party|
|Confidential — third-party PII|Referral client name and contact channel|AES-256-GCM at the column level with a key held outside the database, in addition to disk encryption|TLS 1.3|The recipient company after acceptance; `staff_moderator` and above during review only; deleted on the schedule in [data-storage.md §4](data-storage.md#4-retention-and-deletion)|
|Secret|Password hashes, TOTP seeds, session ids, QR verification tokens, API keys|Password hashes are argon2id. TOTP seeds are AES-256-GCM at the column level under `TOTP_ENCRYPTION_KEY`, each bound to its member id so a seed copied onto another row fails to decrypt ([ADR 0016](decisions/0016-totp-seeds-encrypted-and-reissued.md)) — a seed cannot be hashed, because verification needs the original bytes back. QR tokens and session ids are stored only as SHA-256 hashes. The database never holds a usable credential|TLS 1.3|Nobody. There is no interface, for any role, that displays any of these|
|Financial|Invoice amounts, currency, country, Stripe identifiers|AES-256 at rest|TLS 1.3|`staff_admin` and above|
|Card data|—|**Never held.** All entry on Stripe-hosted surfaces|—|—|

**Never logged or exported:** passwords in any form, password hashes, session
ids, TOTP seeds, one-time codes, QR verification tokens, full phone numbers
(logs carry a keyed hash and the last two digits), referral client contact
details, Stripe secret keys, and the `Authorization` or `Cookie` headers.
Enforced by a redaction layer in the logger with a deny-list of field names, and
by a test that asserts a request containing each of these produces a log line
containing none of them.

**Encryption in transit:** TLS 1.3 minimum, TLS 1.2 not offered. HSTS with
`max-age=63072000; includeSubDomains; preload`, enabled two weeks after a stable
production. Connections to Neon, Upstash and R2 all use TLS with certificate
verification; there is no internal plaintext hop.

**Key management:** application encryption keys (column encryption, phone
hashing pepper) live in Vercel environment variables, sourced from 1Password,
readable in production by the owner and the tech lead only. Keys are versioned —
ciphertext carries a key id — so rotation is a re-encrypt job, not a big-bang
migration. Rotation schedule: annually, and immediately on any suspicion.
Stripe, Twilio, Resend, Upstash and R2 credentials rotate every 90 days on a
calendar reminder, and immediately when anyone with access leaves.

---

## 4. Secrets management

|Secret|Stored in|Rotated|Who can read|
|-|-|-|-|
|`DATABASE_URL` (pooled, `app_rw`)|Vercel env, per environment|90 days|Owner, tech lead|
|`DATABASE_MIGRATE_URL` (`app_migrate`)|GitHub Actions secret|90 days|Owner (CI uses it; no human needs it)|
|`STRIPE_SECRET_KEY`|Vercel env|90 days|Owner|
|`STRIPE_WEBHOOK_SECRET`|Vercel env|On endpoint change|Owner|
|`TWILIO_*` (account SID, auth token, Verify service SID)|Vercel env|90 days|Owner, tech lead|
|`AUTH_SECRET` (session signing)|Vercel env|Annually — rotation signs out everyone, so it is scheduled|Owner|
|`COLUMN_ENCRYPTION_KEY_V<n>`|Vercel env, versioned|Annually, with re-encryption|Owner|
|`TOTP_ENCRYPTION_KEY`|Vercel env|Not rotatable without re-enrolment — every staff authenticator is re-registered, so it is scheduled, not casual ([ADR 0016](decisions/0016-totp-seeds-encrypted-and-reissued.md))|Owner|
|`PHONE_HASH_PEPPER`|Vercel env|Never rotated casually — rotation requires rehashing every phone index|Owner|
|`RESEND_API_KEY`, `UPSTASH_*`, `R2_*`|Vercel env|90 days|Owner, tech lead|
|Backup age key|1Password only, never in any environment|Annually|Owner, tech lead|
|1Password vault|1Password, MFA enforced|—|Owner, tech lead|

**Rules:**

- No secrets in the repository, in CI logs, or in client-side code. Any
  environment variable that must reach the browser is prefixed
  `NEXT_PUBLIC_` — and a lint rule rejects that prefix on anything whose name
  matches `KEY|SECRET|TOKEN|PASSWORD`.
- Secret scanning in CI: `gitleaks` on every push and as a pre-commit hook, plus
  GitHub push protection.
- Leak procedure: **rotate first, investigate second.** Rotate the credential,
  invalidate anything derived from it, then read the logs to determine exposure.
  The order matters — an investigation performed before rotation is an
  investigation conducted while the attacker still has the key. A leaked Stripe
  key additionally requires a check of recent API activity in the Stripe
  dashboard and notification of Stripe support.

---

## 5. Dependency and supply-chain security

|Control|Approach|
|-|-|
|Vulnerability scanning|`pnpm audit --audit-level=moderate` in CI on every pull request; GitHub Dependabot alerts; Renovate opens the fix pull request automatically|
|Update cadence|Weekly grouped batch — see [technology.md §9](technology.md#9-versions-and-upgrade-policy)|
|Critical patch SLA|Critical or high advisory affecting production code: patched and deployed within 48 hours. The clock starts when the advisory is published, not when someone notices|
|Adding a new dependency|Approved by the tech lead in review, against four questions: is it maintained (release in the last 90 days), is the licence permissive, what is the transitive weight, and could we write this in fifty lines instead? A dependency added to save fifty lines is a decision to trust a stranger forever|
|Lockfile policy|`pnpm-lock.yaml` committed; CI installs with `--frozen-lockfile`; a pull request that changes the lockfile without changing `package.json` is rejected|
|Base image / runtime patching|No containers in production — Vercel patches the runtime. Node major versions are our responsibility and follow the LTS policy|
|Build integrity|CI has no production credentials. Deployment is performed by Vercel from a signed GitHub commit; no engineer's laptop can deploy to production|
|Third-party client-side scripts|None. No analytics tag, no chat widget, no font CDN, no advertising pixel. Every asset is first-party, which is what makes the strict CSP in §6 achievable — a single third-party script would end it|

---

## 6. Application security controls

|Risk|Control|
|-|-|
|Injection (SQL / NoSQL / command)|Drizzle parameterises everything; a lint rule forbids `sql.raw` outside `src/data`, where its three uses are reviewed. No shell execution anywhere in the application|
|Cross-site scripting (XSS)|React escapes by default; `dangerouslySetInnerHTML` is banned by lint with no exception. Partner-supplied text is stored raw and escaped at render, never sanitised-and-trusted. CSP is `default-src 'self'` with nonce-based scripts and no `unsafe-inline`, achievable because there are no third-party scripts|
|Cross-site request forgery (CSRF)|`SameSite=Lax` cookies plus an origin check on every mutating request; Next.js Server Actions carry an action id that is not guessable cross-origin. Both, not either|
|Insecure direct object references|Ownership filters inside repository functions; every identifier exposed to a client is a UUIDv7, never a sequence; an automated test replays the whole route table with a second member's identifiers and asserts no data is returned|
|Input validation|Zod schemas at every boundary — Server Actions, Route Handlers, webhook bodies, environment variables. The same schema runs in the browser for user experience and on the server for safety; the server never trusts that the browser ran it|
|Output encoding|React for HTML; explicit JSON serialisation for API responses; `Content-Type` always set; no template string ever builds markup|
|File upload handling|Not applicable — there is no file upload anywhere in the product. Partner logos are a member-supplied external URL, fetched by the browser directly rather than uploaded to KCLUB storage ([ADR 0013](decisions/0013-partner-logos-as-external-urls.md))|
|Rate limiting / brute force|Sliding-window limits in Redis at three layers: per IP at the edge, per account on authentication, per business action (SMS requests, referrals, verification lookups). Failed sign-ins escalate delay per account: 3 → 1 s, 5 → 30 s, 10 → 15 min lockout with a notification to the member|
|Security headers|`Content-Security-Policy` (nonce-based, `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'self' checkout.stripe.com`), `Strict-Transport-Security` with preload, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying camera, microphone, geolocation and payment, `Cross-Origin-Opener-Policy: same-origin`|
|CORS policy|No cross-origin API access is permitted. The application serves its own frontend; there is no browser client on another origin, so there is no `Access-Control-Allow-Origin` header to widen. Webhook endpoints are server-to-server and need none|
|Clickjacking|`frame-ancestors 'none'`; the staff console additionally sets `X-Frame-Options: DENY` for older agents|
|Enumeration|Sign-in and registration return the same response and take the same time whether or not the number is known. The card verification page returns the same shape for unknown, revoked and valid tokens. Password reset has no implementation yet (accepted gap, [requirements.md §9](requirements.md#9-open-questions)) — this constraint applies to whatever reset flow is eventually built|
|Bots|Cloudflare Turnstile on registration, invisible unless the request looks automated. Chosen over reCAPTCHA to avoid sending visitor data to an advertising company. Password reset has no implementation yet to gate|

---

## 7. Auditing and access control

**Audited actions.** Every mutation by a staff user or by `system`, and — unusually
— every staff **read** of a member record, because in a privacy product looking
is itself the sensitive act:

- Staff sign-in, sign-out, failed sign-in, TOTP enrolment and reset
- Any member record opened by a staff user, with the member id and the reason
  where the console asks for one
- Block, unblock, card revoke, card reissue
- Company approve, reject, publish, hide, edit, rank change, discount change
- Referral approve, reject, sender bar
- Price change, plan change
- Staff account creation, role change, disable, re-enable
- Data export and erasure approval
- Entitlement grants and revocations by `system`, with the Stripe event id that
  caused them
- Every use of the break-glass production database access process

Each entry records: actor type and id, action, target type and id, before and
after values as `jsonb` (with confidential fields redacted to a hash), IP
address, user agent, correlation id, and timestamp.

**Can an administrator delete their own trail?** No. The application's database
role holds `INSERT` on `audit_log` and neither `UPDATE` nor `DELETE`, so no code
path — including a compromised one — can rewrite history. Removing rows requires
the migration role, which exists only in CI. This is the single most useful
control in the document, and it costs one `GRANT`.

**Audit log retention:** 7 years, partitioned by month, never deleted by the
application.

**Production access:** no standing human access to the production database or to
production secrets beyond the owner and the tech lead. Engineer access is
break-glass: requested for a named incident, granted by the owner, read-only,
masked for phone numbers and referral contacts, expiring automatically after 4
hours, announced in the incident channel and recorded. Access is reviewed
quarterly and revoked the same day someone leaves the project — the checklist
covers Vercel, Neon, Stripe, Twilio, Cloudflare, GitHub, 1Password and Sentry,
because the account nobody remembers is always the one that matters.

---

## 8. Compliance

|Regulation|Applies because|Obligations|
|-|-|-|
|GDPR / UK GDPR|Members resident in the EU and UK|Lawful basis recorded per purpose (contract for membership; consent for marketing; legitimate interest for fraud prevention); data subject access within 30 days (FR-094); erasure per [data-storage.md §4](data-storage.md#4-retention-and-deletion); breach notification to the supervisory authority within 72 hours; a Record of Processing Activities; a Data Processing Agreement with every sub-processor (Vercel, Neon, Upstash, Cloudflare, Stripe, Twilio, Resend, Sentry, Axiom, Inngest); Standard Contractual Clauses for the US transfer. Note: the client has explicitly elected not to appoint an Art. 27 representative despite being established outside the EU|
|CCPA / CPRA|California residents in the primary market|Notice at collection; right to know, delete and correct; an explicit statement that we do not sell or share personal information — which is true, and is why there is no advertising pixel anywhere in the product|
|TCPA + CTIA messaging principles|SMS to US numbers|Express consent captured and stored at sign-up with the exact wording shown; opt-out honoured (STOP/HELP handled by Twilio); no marketing SMS without separate consent. No A2P 10DLC registration of our own — verification codes leave from Twilio Verify's registered sender pool ([decisions/0010](decisions/0010-no-own-a2p-registration-with-twilio-verify.md)); the consent and opt-out obligations above are ours regardless and are unaffected by that|
|PCI-DSS SAQ-A|Card payments|Satisfied by construction: card data is entered only on Stripe-hosted pages, never transits our servers, and no field on any of our forms accepts a card number. Annual self-assessment questionnaire|
|ePrivacy / cookie rules|EU visitors|Only strictly necessary cookies are set (session, locale, theme). No consent banner is required because there is nothing to consent to — a direct consequence of having no third-party scripts|
|Digital services tax / VAT|Cross-border subscription sales|Depends on the operating entity; open question in [brief.md](brief.md#open-questions). Stripe Tax is the planned mitigation|

**The gap between this section and what is published.** The controls above are
implemented by the design. The club's executed Privacy Policy addresses
CCPA/CPRA only and contains no GDPR section, no sub-processor list, no breach
notification clock and no data-protection contact beyond a shared mailbox. It
also authorises marketing cookies and third-party trackers that the design does
not use — which is what allows the "we do not sell or share" statement and the
absence of a consent banner. Both divergences are registered in
[legal-alignment.md](legal-alignment.md#2-conflicts) (C-03, C-06) and must be
closed before launch: implementing a control the policy does not promise is
better than the reverse, but it is not compliance.

**Data subject request handling.** Access, portability, correction and erasure
requests arrive at a monitored address, are logged, and are executed through the
staff console rather than by hand in the database — the console is what makes
them auditable. Target: acknowledged within 72 hours, completed within 30 days.

**Can we produce everything we hold about one person?** Yes: FR-094 exports the
member row, card, sessions, companies, subscriptions, payments, referrals sent
and received, notification history and audit entries concerning them, as JSON.
The export deliberately excludes another person's data — a referral shows the
recipient company, not the recipient's personal details.

---

## 9. Incident response

|Step|Who|Action|
|-|-|-|
|1. Detect and report|Anyone|Report to `security@kclub.com` or the `#incident` channel. Anyone who suspects an incident declares one; false alarms are free, hesitation is not|
|2. Contain|Tech lead|Rotate the affected credential first. Then: kill sessions (`DELETE FROM member_session`), disable sign-up or SMS with the kill switch, block an IP range at Cloudflare, or put the application in maintenance mode. Containment precedes understanding|
|3. Assess|Tech lead + owner|What was accessed, by whom, when, and how many people are affected. Sources: audit log, Axiom logs (30 days), Sentry, Vercel and Cloudflare logs, Stripe and Twilio activity|
|4. Notify|Owner|Supervisory authority within **72 hours** of becoming aware, where GDPR is engaged; affected individuals without undue delay where there is high risk to them; US state breach laws where the affected person resides — the strictest applicable clock governs. Legal counsel drafts; the owner signs|
|5. Recover|Tech lead|Restore from backup if data was destroyed ([data-storage.md §5](data-storage.md#5-backup-and-recovery)); force password resets if credentials are implicated; reissue cards if QR tokens leaked; re-verify subscription state against Stripe|
|6. Review|Whole team|Blameless post-mortem within 5 working days, with dated actions and owners. Every action lands in the document that failed to prevent it|

**Security contact:** `security@kclub.com`, monitored by the owner and the tech
lead, published in `/.well-known/security.txt` with a 90-day disclosure window
and a commitment to acknowledge within 3 working days.

**The three scenarios rehearsed before launch**, because these are the ones that
happen: a leaked Stripe secret key; an SMS-pumping attack in progress; a staff
account compromised by phishing. Each has a runbook in
[observability.md §9](observability.md#9-runbooks).

---

## 10. Security testing

|Activity|Frequency|Who|
|-|-|-|
|Automated scanning in CI (`pnpm audit`, `gitleaks`, ESLint security rules, CodeQL)|Every pull request|CI, blocking on moderate and above for audit/gitleaks/ESLint; CodeQL produces a SARIF artifact until GitHub Code Scanning is enabled for the repository|
|Authorization test suite: every route replayed as guest, as another member, and as each staff role|Every pull request|CI, blocking|
|Log-redaction test: a request containing every secret field produces no log line containing any of them|Every pull request|CI, blocking|
|Dependency audit review|Weekly|Tech lead|
|Penetration test (external, authenticated and unauthenticated, including the staff console)|Before public launch, then annually and after any change to authentication or billing|Third party|
|Access review across all vendors|Quarterly, and same-day on departure|Owner|
|Restore drill|Quarterly|Tech lead|
|Incident tabletop for the three scenarios in §9|Before launch, then twice a year|Whole team|
|Threat model review|Each time a feature touches identity, money or third-party personal data|Tech lead|
