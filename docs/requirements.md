# Requirements

> **Status:** In review
> **Owner:** KCLUB Delivery Lead
> **Last updated:** 2026-08-02
> **Write when:** before building anything beyond a prototype.

The single source of truth for _what_ is being built and _when it is done_.
Every other document in `docs/` is downstream of this one.

---

## 1. Product goal

KYLYVNYK CLUB (KCLUB) is a closed, international business club delivered as a
web application. Verified members get a digital membership card and access to a
catalogue of vetted partner businesses that offer them a discount; members who
own a business can additionally pass warm client referrals to other member
businesses. Everything is moderated, and nothing about a member is public.

Today the same need is met by open-internet search, where nothing is verified
and the incentive is to rank rather than to be trustworthy. KCLUB replaces
"search and hope" with "a closed circle that has already been checked".

**Success metric:** 400 subscriptions in force by 2027-03-31 (VIP memberships
plus partner listings combined, ~$8,000 MRR). Leading indicators are in
[brief.md](brief.md#what-success-looks-like).

---

## 2. Scope

### In scope

- Phone-number identity: registration, SMS one-time-code verification, password
  sign-in, password reset, session revocation.
- Automatic issue of a digital membership card with a QR code, and a public
  verification page that discloses the minimum needed to confirm validity.
- Member-only partner catalogue with search and filtering by category, country
  and city.
- Partner onboarding as a four-step application, followed by staff moderation
  and a paid listing subscription before publication.
- Two Stripe subscription products at $19.99/month: **VIP membership** (member)
  and **Partner listing** (per company).
- Client referrals between published partner companies, gated on VIP, rate
  limited, and moderated before delivery.
- Staff console: dashboards, finance reporting, member and card administration,
  moderation queues, reference data, pricing, staff and role management, and an
  immutable audit log.
- Full interface localisation into English, Russian and Ukrainian; light and
  dark themes.
- Public marketing site with a curated partner showcase, FAQ, testimonials and
  the legal pages.

### Out of scope

|Not building|Why / when|
|-|-|
|Member directory, member search, member-to-member messaging|Rejected permanently. The absence of a member directory is the product promise — see [decisions/0005-no-member-directory.md](decisions/0005-no-member-directory.md)|
|Ratings and user-written reviews of partners|Rejected. Invites gaming and retaliation; contradicts a moderated, trust-based club. Testimonials on the marketing site are curated by staff|
|Any reward, commission or bonus for introducing a member or a partner|Rejected permanently. The product must be structurally unable to function as MLM; there is no referral code, no downline, no payout|
|Taking payment for partner goods or services; escrow; dispute arbitration|Rejected. We charge for membership and for listing only. Changes the regulatory posture entirely (money transmission)|
|Native iOS/Android applications|Deferred indefinitely. Responsive web plus PWA install covers the phone case|
|Apple Wallet / Google Wallet passes|Deferred to phase 2. Nice to have; requires Apple developer enrolment and pass signing|
|"Business" tier for companies (up to 10 seats, integrations, account manager)|Deferred. Sold manually via "contact us" until there is demand; no self-serve billing for it at launch|
|Social sign-in beyond Google|Google is offered as an optional entry point ([ADR 0029](decisions/0029-google-sign-in.md)); no other provider|
|Automatic machine translation of partner-written content|Rejected. Partners supply English, optionally Russian and Ukrainian; machine translation of legal/commercial terms is a liability|
|Multi-currency pricing|Deferred. USD only at launch; Stripe presents the card's local conversion|
|Self-serve refunds|Deferred. Refunds are issued by staff in the Stripe dashboard under the published refund policy|

---

## 3. Users and roles

Role names here are identical to those in
[security.md §2](security.md#2-authentication-and-authorization) and in the
`role` enums in the schema.

Members and staff are **separate identities in separate tables**. A staff member
who is also a club member holds two accounts — see
[decisions/0007-staff-identities-separate.md](decisions/0007-staff-identities-separate.md).

|Role|Description|Key permissions|
|-|-|-|
|`guest`|Unauthenticated visitor|Marketing site, legal pages, curated showcase, card verification page, sign-up|
|`member`|Verified member, free tier|Own card, browse and search the catalogue, see discounts, submit own company, manage own subscription and profile|
|`member_vip`|Member with an active VIP subscription|Everything `member` has, plus sending client referrals and priority support|
|`partner_owner`|A member who owns at least one company in the catalogue (an attribute, not a separate login)|Edit own company, receive and accept/decline incoming referrals, manage that company's listing subscription|
|`staff_support`|Support staff|Read-only across the console: members, cards, subscriptions, payments, moderation history. No mutations|
|`staff_moderator`|Content moderation|Everything `staff_support` has, plus approve/reject companies, moderate referrals, manage categories/countries/cities|
|`staff_admin`|Day-to-day operations|Everything `staff_moderator` has, plus block/unblock members, revoke/reissue cards, publish/hide companies, set discounts and showcase ranks, view finance|
|`staff_owner`|Club owner|Everything. Uniquely: manage staff accounts and roles, change prices, read the full audit log, approve data-erasure requests|
|`system`|Scheduled jobs and webhook handlers (non-human)|Provision and revoke entitlements, dunning, reconciliation, card expiry. Acts under an explicit `system` actor in the audit log|

---

## 4. Functional requirements

Priority: **M** = must have · **S** = should have · **C** = could have

### 4.1 Identity and access

|ID|Requirement|Role|Priority|
|-|-|-|-|
|FR-001|The system must register a member from a phone number in E.164 form plus a password, and may hold one email address per member, unique across members and proven by a single-use link before it counts as an identifier ([ADR 0028](decisions/0028-email-identifier-and-account-recovery.md))|guest|M|
|FR-002|The system must verify the phone number with a 6-digit one-time code delivered by SMS, valid for 10 minutes, with at most 5 verification attempts per code|guest|M|
|FR-003|The system must limit code requests to 1 per 60 seconds, 5 per phone number per hour and 20 per IP address per hour, and must reject numbers from destinations disabled for fraud reasons|guest|M|
|FR-004|The system must not create a member record that is visible to any other user until the phone number is verified|guest|M|
|FR-005|The system must authenticate a returning member with either their phone number or a **verified** email address, plus password, or through a linked Google account whose verified address the member has also proved here ([ADR 0029](decisions/0029-google-sign-in.md)); and must require a fresh SMS code when the sign-in comes from an unrecognised device|member|M|
|FR-006|The system must allow a password reset proven by an SMS code, and must revoke all other sessions when the password changes|member|M|
|FR-007|The system must let a member list their active sessions and revoke any or all of them|member|S|
|FR-008|The system must collect only display name, preferred language and country at registration, and must let the member change them|member|M|
|FR-009|The system must let a member request deletion of their account and must complete it within 30 days, per [data-storage.md §4](data-storage.md#4-retention-and-deletion)|member|M|
|FR-010|The system must terminate every session of a member within 60 seconds of that member being blocked by staff|staff_admin|M|
|FR-011|The system must let a member change their phone number, proven by a code sent to both the old and the new number|member|C|

### 4.2 Membership card

|ID|Requirement|Role|Priority|
|-|-|-|-|
|FR-020|The system must issue a membership card automatically when a phone number is verified, with a unique human-readable serial|system|M|
|FR-021|The system must display the card in the member area with the member's tier, serial and a QR code, rendered legibly on a phone screen at arm's length|member|M|
|FR-022|The QR code must encode a URL containing an opaque, unguessable token that is not derived from the member identifier|system|M|
|FR-023|The verification page must disclose only: validity (`valid` / `revoked` / `expired`), tier, card serial, issue date, and either the member's display name or the literal "Private member" if the member has chosen not to show it|guest|M|
|FR-024|The verification page must be excluded from search engine indexing and rate limited to 30 lookups per IP address per minute|guest|M|
|FR-025|Staff must be able to revoke a card and to reissue it; a reissue must invalidate the previous QR token immediately|staff_admin|M|
|FR-026|The card must reflect a tier change (free ↔ VIP) within 60 seconds of the subscription state changing|system|M|
|FR-027|The system should offer the card as an Apple Wallet and Google Wallet pass|member|C|

### 4.3 Partner catalogue

|ID|Requirement|Role|Priority|
|-|-|-|-|
|FR-030|The system must show the catalogue only to authenticated members; an unauthenticated request must receive the sign-in page, not a partial listing|member|M|
|FR-031|The system must let a member filter the catalogue by category, country and city, and combine those filters|member|M|
|FR-032|The system must let a member search partner names and descriptions, returning results ranked by relevance, in any of the three supported languages|member|M|
|FR-033|A partner detail page must show the discount offered, its conditions, the category, location, contact details and the partner's own description|member|M|
|FR-034|The system must show at most 3 partners in the "Top" block and at most 3 in the "Featured" block, ordered by a rank set by staff|member|M|
|FR-035|The marketing site must show a curated showcase of partners without disclosing the full catalogue|guest|S|
|FR-036|The catalogue must return the first page of results within 400 ms at p95 measured at the server|member|S|

### 4.4 Partner onboarding and moderation

|ID|Requirement|Role|Priority|
|-|-|-|-|
|FR-040|A member must be able to submit their own company through a four-step form, saving a draft between steps|member|M|
|FR-041|The system must reject a submission whose city does not belong to the selected country, or whose category is on the prohibited list|member|M|
|FR-042|A submitted company must enter a moderation queue and must not be visible to any member before approval|system|M|
|FR-043|Staff must be able to approve a submission, or reject it with a reason chosen from a fixed list plus free text; the applicant must be notified of the outcome|staff_moderator|M|
|FR-044|An approved company must be published only after its listing subscription is active; approval alone must not publish it|system|M|
|FR-045|A company owner must be able to edit their published listing; edits to name, category, description or discount must return it to moderation, and the previously approved version must stay live meanwhile|partner_owner|M|
|FR-046|Staff must be able to hide, unhide, edit and unpublish any company, and to set its discount terms and showcase rank|staff_admin|M|
|FR-047|The system must record every moderation decision with the deciding staff member, timestamp and reason, and must keep that record after the company is deleted|system|M|
|FR-048|Moderation of a new submission should be completed within 3 business days at the 90th percentile; the queue must show the age of each item|staff_moderator|S|

### 4.5 Subscriptions and payments

|ID|Requirement|Role|Priority|
|-|-|-|-|
|FR-050|The system must sell a VIP membership subscription at the price configured for the `vip_monthly` plan (launch price $19.99/month) through Stripe Checkout|member|M|
|FR-051|The system must sell a listing subscription per company at the price configured for the `listing_monthly` plan (launch price $19.99/month)|partner_owner|M|
|FR-052|Entitlements must be derived exclusively from Stripe subscription state received over webhooks; a return from the Stripe redirect must never itself grant access|system|M|
|FR-053|The system must process each Stripe event exactly once, and must remain correct when the same event is delivered more than once or out of order|system|M|
|FR-054|A cancelled subscription must retain full access until the end of the paid period, and must lose it within 5 minutes of that period ending|system|M|
|FR-055|A company whose listing subscription lapses must be unpublished automatically, and republished automatically if payment is recovered within the grace period|system|M|
|FR-056|On a failed payment the system must apply a 14-day grace period with retries, keep access during it, and notify the subscriber on failure and before expiry|system|M|
|FR-057|The system must let a subscriber update their payment method, see invoices and cancel through the Stripe Customer Portal|member|M|
|FR-058|The system must reconcile local subscription state against Stripe daily and must alert on any divergence|system|M|
|FR-059|The `staff_owner` role must be able to change a plan's price; a change must apply to new subscriptions only and must never silently reprice an existing one|staff_owner|M|
|FR-060|The system must never store a card number, CVC or full PAN; all card data entry must happen on Stripe-hosted surfaces|system|M|

### 4.6 Client referrals

|ID|Requirement|Role|Priority|
|-|-|-|-|
|FR-070|A member with an active VIP subscription and at least one published company must be able to send a client referral to another published company|member_vip|M|
|FR-071|A referral must capture the client's name, a single contact channel, the service needed and an optional note — and nothing else|member_vip|M|
|FR-072|The sender must explicitly attest that the client consented to being introduced; the attestation, its timestamp and the sender's identity must be stored with the referral|member_vip|M|
|FR-073|The system must limit a sender to 10 referrals per rolling 24 hours, and to 3 per rolling 24 hours to any single recipient company|system|M|
|FR-074|A referral must pass staff moderation before the recipient is notified|staff_moderator|M|
|FR-075|The recipient must be able to accept or decline; the client's contact details must be revealed only after acceptance, and a decline must delete them within 24 hours|partner_owner|M|
|FR-076|The sender must see the status of each referral (`pending_review`, `rejected`, `delivered`, `accepted`, `declined`, `expired`) but must not see the recipient's private notes|member_vip|M|
|FR-077|A referral not acted on within 14 days must expire and its client contact details must be deleted|system|M|
|FR-078|Staff must be able to reject a referral, and to bar a member from sending further referrals|staff_moderator|M|

### 4.7 Staff console

|ID|Requirement|Role|Priority|
|-|-|-|-|
|FR-080|Staff sign-in must require a second factor (TOTP); an account without an enrolled second factor must not be able to complete sign-in|staff_support|M|
|FR-081|The console must show total members, active members, new members in the last 7 days, companies awaiting moderation, and referrals awaiting moderation|staff_support|M|
|FR-082|The console must show revenue for the last 30 days, active subscription counts split by type, renewals due in the next 7 days, the 50 most recent payments, and revenue grouped by country including a world map|staff_admin|M|
|FR-083|Staff must be able to find a member by phone number, card serial or display name, and view their card, subscriptions and activity history|staff_support|M|
|FR-084|`staff_admin` must be able to block and unblock a member, with a mandatory reason|staff_admin|M|
|FR-085|Staff must be able to manage business categories, countries and cities, and must not be able to delete one that is still referenced|staff_moderator|M|
|FR-086|`staff_owner` must be able to create, disable and re-enable staff accounts and change their roles; a staff member must not be able to change their own role|staff_owner|M|
|FR-087|Every mutating staff action must be written to an append-only audit log recording actor, action, target, before/after values, IP address and timestamp|system|M|
|FR-088|The audit log must be searchable by actor, target and date range, and must not be editable or deletable from within the application by any role|staff_owner|M|
|FR-089|The console must be unreachable from the public marketing domain and must be excluded from search engine indexing|system|M|

### 4.8 Platform-wide

|ID|Requirement|Role|Priority|
|-|-|-|-|
|FR-090|Every interface string must be available in English, Russian and Ukrainian, including validation messages, emails and SMS|guest|M|
|FR-091|The system must select a language from the member's saved preference, then the browser's `Accept-Language`, then English, and must expose a manual switch that persists|guest|M|
|FR-092|The system must support a light and a dark theme, following the operating system by default with a manual override that persists|guest|M|
|FR-093|The system must publish the nine legal documents supplied in [policy/](policy/) — Terms of Use, Privacy Policy, Cookie Policy, Club Rules, Partner Rules, Business Introduction Rules, Refund Policy, Disclaimer and Contact Us — each versioned, in all three languages with the English version marked authoritative, and must record which version of each a member accepted at registration|guest|M|
|FR-097|Registration must capture separate, affirmative acknowledgement of the arbitration agreement and class-action waiver (Terms §29–30) and of being 18 or older, each recorded with its timestamp and document version|guest|M|
|FR-098|Account deletion must not cancel an active subscription implicitly: the flow must show every active subscription and require an explicit choice to cancel or keep it (Terms §12)|member|M|
|FR-094|The system must be able to export everything it holds about one member in a machine-readable form within 30 days of a request|staff_owner|M|
|FR-095|Transactional notifications (moderation outcome, payment failure, referral received) must be delivered by email where an address is known and by SMS where it is not, in the member's language|system|S|
|FR-096|The application must be installable as a PWA on iOS and Android home screens|member|C|
|FR-099|Every member must have an in-product inbox that records the outcome of anything the system did to them — moderation decisions, incoming client referrals, payment events and their welcome — showing each in the member's current language, with an unread count, and readable only by that member|member|M|
|FR-100|Listing checkout must be reachable as soon as a company is submitted, before moderation, and must be refused only for a company the caller does not own or that has already been rejected|partner_owner|M|
|FR-101|Rejecting a company whose listing subscription was already paid must cancel that subscription and refund its last invoice, exactly once however many times the rejection is submitted|staff_moderator|M|

---

## 5. Non-functional requirements

### 5.1 Performance

Targets are for the United States and Western Europe on a 4G mobile connection.
They are budgets, not aspirations: a release that misses one is a release with a
defect.

|Aspect|Target|Measured how|
|-|-|-|
|Page load, marketing pages (p95 LCP)|< 2.0 s|Vercel Speed Insights, real user monitoring, 28-day window|
|Page load, member area (p95 LCP)|< 2.5 s|Vercel Speed Insights|
|Interaction to Next Paint (p95)|< 200 ms|Vercel Speed Insights|
|API response, reads (p95)|< 300 ms|Server timing histogram by route, [observability.md §4](observability.md#4-metrics)|
|API response, writes (p95)|< 800 ms|As above|
|Catalogue search (p95)|< 400 ms|As above; the query plan is checked in CI against a 10,000-row fixture|
|Card verification page (p95, cold)|< 1.0 s|Synthetic check every 60 s from three regions|
|Concurrent users|500 concurrent sessions, 50 requests/second sustained, 200 rps peak|k6 load test before launch and before each quarter's largest release|
|SMS code delivery|95% delivered within 30 s|Twilio Verify delivery metrics|

### 5.2 Availability

**Required uptime:** 99.9% per calendar month for the member area and the card
verification page (~43 minutes of error budget); 99.5% for the staff console.

**Acceptable downtime window:** planned maintenance between 03:00 and 05:00
UTC, announced 48 hours ahead, no more than once a month. Schema migrations are
expected to run with no window at all — see
[data-storage.md §3](data-storage.md#3-schema-and-migrations).

Objectives, error budget policy and failure handling are in
[reliability.md](reliability.md).

### 5.3 Scalability

|Dimension|At launch|After 12 months|After 36 months (design ceiling)|
|-|-|-|-|
|Members|1,000|25,000|150,000|
|Published companies|50|2,000|15,000|
|Referrals per month|0|3,000|25,000|
|Peak requests/second|20|50|300|
|Primary database size|< 1 GB|~8 GB|~60 GB|

The growth is in read traffic against a small dataset. Every figure in the
36-month column is comfortably inside a single PostgreSQL primary with read
replicas; nothing in this design requires sharding, and a design that
anticipated it would be paying for a problem this product will not have. The
first thing to break under 10× is discussed in
[reliability.md §9](reliability.md#9-capacity-planning).

### 5.4 Usability and accessibility

**Accessibility standard:** WCAG 2.1 Level AA. This is a goal in most of the
world and an obligation in the United States, where the ADA is applied to
commercial websites through Title III and where the practical exposure is a
demand letter rather than a regulator. Treated as a launch requirement.

**Languages:** English (default), Russian, Ukrainian — full interface parity, no
partially translated screens. No right-to-left language at launch.

**Browsers:** the last two major versions of Chrome, Safari, Edge and Firefox,
plus iOS Safari 16+ and Android Chrome. No Internet Explorer, no Opera Mini.

**Devices:** mobile-first. The design target is a 390 px-wide viewport; desktop
is a widened layout of the same information, not a different product.

**Locale formatting:** dates, numbers and currency follow the selected locale;
all prices are shown in USD with an explicit `$` and `USD` label to avoid
ambiguity for international members.

### 5.5 Compliance and legal

|Regime|Applies because|Principal obligation|
|-|-|-|
|GDPR / UK GDPR|Members will be resident in the EU and the UK|Lawful basis, data subject access and erasure, breach notification within 72 hours, processing agreements with every sub-processor, Standard Contractual Clauses for US transfer. Client has elected not to appoint an Art. 27 representative. **The supplied legal pack has no GDPR section** — the design implements these controls against a policy that does not yet promise them|
|CCPA/CPRA (California)|US market focus; California residents|Notice at collection, right to know/delete, "do not sell or share" — we sell no data, but the notice is still required|
|TCPA and CTIA messaging principles (US)|We send SMS to US numbers|Express consent captured at sign-up, opt-out honoured. No A2P 10DLC registration of our own: verification codes are sent from Twilio Verify's registered sender pool, so there is no KCLUB sender to register — see [decisions/0010-no-own-a2p-registration-with-twilio-verify.md](decisions/0010-no-own-a2p-registration-with-twilio-verify.md). Any SMS that is not a verification code would leave Verify and bring the registration back|
|PCI-DSS SAQ-A|We take card payments|Satisfied by never touching card data: all entry happens in Stripe-hosted Checkout and Portal — see [decisions/0004-stripe-billing-as-system-of-record.md](decisions/0004-stripe-billing-as-system-of-record.md)|
|Florida law, binding individual arbitration, class-action waiver|The operator elected them in Terms §28–30|Enforceability in the US depends on conspicuous disclosure and affirmative assent — hence FR-097. Also removes the option of a small-claims-style dispute path|
|US automatic-renewal statutes (California ARL and equivalents)|Subscriptions auto-renew and the primary market is the US|Pre-purchase disclosure, affirmative consent, online cancellation, and in several states a renewal reminder. Terms §11 disclaims notice; the states do not — see [legal-alignment.md](legal-alignment.md#c-08-auto-renewal-without-prior-notice-is-a-us-regulatory-exposure)|
|Sales tax / VAT on digital services|Subscriptions sold internationally by a Florida LLC|The operator is the merchant of record. Florida is the home nexus; economic nexus in other US states and VAT on EU sales follow from volume. Stripe Tax is the planned mitigation; it is not enabled at launch|

**Explicitly checked and not applicable:** HIPAA (we hold no health data — a
member's category may be "medical", but no patient data passes through the
system); SOC 2 (no enterprise customer requires it yet); COPPA (membership is
18+, enforced by attestation at registration and by the Terms).

**Auditable by requirement:** every staff mutation (FR-087), every moderation
decision (FR-047), every referral consent attestation (FR-072), and every
entitlement change caused by a payment event.

---

## 6. Constraints

|Constraint|Type|Impact|
|-|-|-|
|No native applications; web only|Product|Rules out anything requiring a native runtime; PWA is the ceiling for offline and push on iOS|
|Phone is the primary identifier; an email address is a second one|Product (owner decision, [ADR 0028](decisions/0028-email-identifier-and-account-recovery.md), reversing an earlier client decision)|Every SMS costs money and can fail, which is why credentials and sessions stay self-hosted per [decisions/0003-self-hosted-phone-authentication.md](decisions/0003-self-hosted-phone-authentication.md). A verified address is what gives account recovery the second channel it previously lacked|
|Members are never listed to each other|Product|No feature may return a set of members. Enforced at the data-access layer, not by convention|
|Managed platform, minimal operations staff|Organisational|Vercel + Neon + Stripe + Twilio. No Kubernetes, no self-managed database, no bespoke queue infrastructure|
|Launch prices fixed at $19.99/month for both products|Commercial|Unit economics must absorb Stripe fees (~~$0.88 per charge), SMS (~$0.05 per verification) and platform cost (~~$400/month) — break-even is around 25 paying subscriptions|
|Two paid products only; a third ("Business") is sold manually|Commercial|The plan model must be data-driven from day one so a third plan is configuration, not a migration|
|Team of three engineers plus a part-time designer and QA, ~15 weeks to public launch|Time / budget|Drives the phasing in §6.1 and the decision to buy identity infrastructure at the SMS layer while building the session layer|
|Stripe's restricted-business list|Legal|Certain partner categories cannot be accepted regardless of the club's own view|
|Nine executed legal documents, version 1.0, effective 2026-07-01|Legal|The club has already promised these terms in writing. Where the design and the pack disagree, one of them must move before launch — the register is [legal-alignment.md](legal-alignment.md)|
|Prohibited categories are fixed by Terms §15 and Club Rules §11|Legal|Gambling, cryptocurrency and tokens, unlicensed financial services, high-risk investment offers, weapons, adult material. These become the category blocklist in FR-041 and the moderation reject reasons in FR-043|
|Refunds are not offered as a rule (Refund Policy §6)|Commercial / legal|No self-serve refund path. Staff issue discretionary refunds in Stripe for double charges, technical errors, unauthorised charges and mistaken payments only|

### 6.1 Delivery plan

The client had not fixed a team or a date, so this is the recommended shape. It
sequences the work so that the riskiest integration (billing) is exercised
before the largest surface (the staff console) is built.

|Phase|Weeks|Delivers|Exit criterion|
|-|-|-|-|
|0 — Foundations|1–2|Repository, CI, environments, design tokens, i18n scaffolding, schema baseline, observability wired, FR-090…FR-092|A trivial change reaches staging automatically, with tests and a rollback|
|1 — Identity and card|2–5|FR-001…FR-027, FR-093, FR-097|A stranger can register by phone and show a card that verifies by QR|
|2 — Catalogue and onboarding|4–8|FR-030…FR-048|A partner can apply, be moderated, and appear in a searchable catalogue|
|3 — Billing|7–10|FR-050…FR-060, FR-098, FR-100, FR-101|Both subscriptions sell, lapse, recover and reconcile correctly against Stripe test clocks|
|4 — Private beta|10|Milestone in [brief.md](brief.md#first-milestone)|30 seeded partners, 50 invited members, English only|
|5 — Staff console|9–13|FR-080…FR-089, FR-094|Staff run the club without database access|
|6 — Referrals|11–14|FR-070…FR-078, FR-095, FR-099|End-to-end referral with consent, quotas and moderation|
|7 — Hardening and launch|13–15|FR-096, Three locales, WCAG audit, load test, penetration test, legal pages, runbooks|[§8](#8-acceptance-criteria) satisfied|

Phases overlap deliberately: frontend work on a phase starts while the previous
phase's backend is being verified.

---

## 7. Assumptions

|Assumption|If it turns out false|
|-|-|
|SMS to US numbers is deliverable at acceptable cost and latency through Twilio Verify's sender pool|Delivery and routing are Twilio's to fix, and we have no campaign dashboard of our own to diagnose from. Mitigation: a recurring smoke test sends one real code to a team number, so degradation is noticed before members report it|
|A phone number is a durable identifier for our members|Recycled and changed numbers create account-takeover and lockout cases. We accept manual, support-driven recovery; if volume exceeds ~5 cases/week the client must accept a recovery email as an optional second channel|
|Members will accept SMS verification rather than abandoning sign-up|Typical drop-off at an SMS step is 10–25%. If measured drop-off exceeds 30%, the phone-only constraint must be revisited with the client|
|The club operates as a single legal entity in one country, invoicing in USD|Multi-entity operation changes the Stripe account structure and the tax position, and would require reworking the finance reporting in FR-082|
|Partner content is supplied by partners in at least English|Staff become translators; onboarding throughput collapses. Mitigation: English is a required field, other locales optional|
|Referral volume stays low enough for human moderation (< 200/day)|Moderation becomes the bottleneck. Mitigation: the quota in FR-073 caps the worst case; auto-approval for senders with a clean history is the planned escape hatch|
|Growth figures in §5.3 are of the right order|If the club grows 10× faster, the first constraints are database connections and Vercel function concurrency, both of which are configuration changes — see [reliability.md §9](reliability.md#9-capacity-planning)|
|Card data never reaches our servers, keeping us in PCI SAQ-A|Any move to embedded card fields raises us to SAQ-A-EP with a materially larger compliance burden|

---

## 8. Acceptance criteria

- [ ] All **M** functional requirements implemented, each with an automated test
      referencing its FR ID
- [ ] Non-functional targets in §5 measured and met, with the measurement
      recorded — not asserted
- [ ] A full billing lifecycle verified against Stripe test clocks: subscribe,
      renew, fail, recover, cancel, lapse, and duplicate/out-of-order webhooks
- [ ] Card verification discloses nothing beyond FR-023, confirmed by reviewing
      the actual HTTP response body, not the rendered page
- [ ] No endpoint returns a set of members to any member-level role, confirmed
      by an automated test over the whole route table
- [ ] WCAG 2.1 AA audit passed on the ten screens in
      [ux.md §2](ux.md#2-screen-inventory), keyboard-only and with a screen reader
- [ ] All three locales complete, with no untranslated string in any supported
      language, enforced in CI
- [ ] Penetration test completed and all high and critical findings closed
- [ ] A restore drill completed from a production backup, with the elapsed time
      recorded in [reliability.md §6](reliability.md#6-backup-and-restore)
- [ ] Runbooks exist for every paging alert
      ([observability.md §9](observability.md#9-runbooks))
- [ ] Legal pages published and versioned, and their acceptance recorded at
      registration
- [ ] Production SMS delivery verified end to end through Twilio Verify — a real
      code sent to and accepted from an allowlisted number, with Fraud Guard,
      geographic permissions and the daily spend cap confirmed

---

## 9. Open questions

Questions raised by the legal pack are tracked separately in
[legal-alignment.md §4](legal-alignment.md#4-decision-log).

|Question|Owner|Needed by|
|-|-|-|
|~~What identity proof does support accept to restore an account when the phone number is gone?~~|Client|**Answered 2026-09-04 by the owner: a verified email address ([ADR 0028](decisions/0028-email-identifier-and-account-recovery.md))**|
|Who is on call after launch, and under what arrangement?|Client|Before public launch|
|Do offer restrictions (validity, territory, booking required, minimum order) become structured fields? Partner Rules §7 binds the partner to what is published, so free text is a dispute waiting to happen|Client + tech lead|**Overdue** — was needed before phase 2 ended; phase 2 shipped with offer restrictions as free text, unresolved|
