# Glossary

> **Status:** In review
> **Owner:** KCLUB Delivery Lead
> **Last updated:** 2026-08-02
> **Write when:** as soon as a second person joins the project.

One agreed name per concept, used everywhere — in conversation, in the
interface, in the code and in the database.

This is the cheapest document here and one of the most valuable. Without it the
same idea becomes `Customer` in the UI, `user` in the API and `account_holder`
in the schema, and nobody notices until a migration or an incident. Half a page,
written once.

It matters especially when the team discusses the project in one language and
writes code in another: the mapping between the two has to live somewhere
explicit, or every developer invents their own.

For this project that is not hypothetical. The club is discussed in Russian, the
interface ships in three languages, and the code is English. The Russian and
Ukrainian columns below are the agreed translation — a translator who invents a
synonym for "участник" in one screen has introduced a bug, not a stylistic
variation.

---

## Rules

- **One concept, one name.** If two names exist, this table decides which wins;
  the loser is listed in the "Not" column so the decision is visible.
- **The interface uses the user's word, the code uses the same word.** If users
  say "invoice", do not model an `Order`. Where they must differ, record both
  columns below and say why.
- **New term → new row, in the same pull request.** Introducing a domain concept
  without naming it here is how the drift starts.
- **Renaming is a migration.** Change the row, then the code, the schema and the
  interface — not one of them.

---

## Terms

|Term|Definition|In code|In the database|Not to be confused with|
|-|-|-|-|-|
|Member|A person whose phone number is verified and who holds a membership card. Free unless they subscribe to VIP. Registering also requires an email address ([ADR 0032](decisions/0032-phone-and-email-both-required.md)), but an unproved address makes nobody less of a member — it only leaves them without the recovery channel|`Member`|`member`|"User" — never used in the interface or in domain code. "Customer", which in this codebase means only a Stripe Customer object|
|Verified address|An email address a member has proved by opening the link sent to it, stamped in `email_verified_at`. Only a verified address signs anyone in or receives a reset link|`emailVerifiedAt`|`member.email_verified_at`|The address itself, which is merely claimed until the link is opened|
|VIP member|A member with an active VIP subscription. A tier, not a separate entity|`MemberTier.Vip`|`member.tier`|"Premium", "Gold" — both rejected; "Gold" is the card's colour, not a tier|
|Verification link|A single-use, expiring URL emailed to a member to prove an address is theirs (24 hours) or to let them set a new password (30 minutes). Only its hash is stored ([ADR 0032](decisions/0032-phone-and-email-both-required.md))|`VerificationToken`|`verification_tokens`|"Magic link" — this never signs anyone in on its own; the one-time SMS "code", which Twilio owns and we never store|
|Membership card|The digital proof of membership: a serial, a tier and a QR code|`MembershipCard`|`membership_card`|"Pass", "Badge", "Ticket"|
|Card serial|The human-readable identifier printed on the card, shown at verification|`cardSerial`|`membership_card.serial`|The card's `id` (a UUID, never shown) and the verification token (secret)|
|Verification token|The opaque secret inside the QR code. Stored only as a hash|`verificationToken`|`membership_card.verify_token_hash`|The card serial, which is public and non-secret|
|Partner|A business published in the catalogue with an active listing subscription|`Company` where published|`company`|"Vendor", "Supplier", "Merchant" — none are used. Note the deliberate mismatch: the interface says "partner", the code says `Company`, because a company exists before it is a partner|
|Company|A business record at any stage. The published statuses are fixed by Partner Rules §6: `under_review`, `published`, `hidden`, `suspended`, `removed`, plus the internal `approved` that precedes publication|`Company`|`company`|"Partner", which is a company that has completed all three gates|
|Company draft|An application still being filled in, before it is submitted. Not a company and not a moderation status — it lives in its own table until submission creates the company ([0011](decisions/0011-company-drafts-in-their-own-table.md))|`CompanyDraft`|`company_drafts`|A `Company` with a `draft` status, which is what this deliberately is not|
|Partner owner|The member who owns a company. An attribute of a member, not a separate account|`isPartnerOwner(member)`|derived from `company.owner_member_id`|A staff role. A partner owner has no console access|
|Listing|A published company's presence in the catalogue, and the thing its subscription pays for|`Listing`|derived from `company.status`|The company itself|
|Discount|The benefit a partner promises members, with its conditions|`DiscountTerms`|`company.discount_*`|"Offer", "Deal", "Coupon" — there is no coupon code anywhere in this product|
|Catalogue|The member-only, searchable set of published partners|`catalogue` module|—|"Directory" — rejected, because a directory implies listing people, which we never do. "Marketplace" — rejected, we sell nothing on a partner's behalf|
|Showcase|The curated set of partners visible on the public site|`showcase`|`company.showcase_rank`|The catalogue. The showcase is a marketing surface; the catalogue is the product|
|Referral|A warm introduction of a **client** from one partner company to another. The user-facing English name is "Client referral"|`Referral`|`referral`|**"Business Introduction"** — a different feature entirely (see the next row). "Lead" — rejected, it frames a person as a commodity. "Invitation" — that would mean inviting a member, which does not exist here|
|Business Introduction|The legal pack's name for introducing two **participants** to each other and exchanging their own contact details, plus networking events. Listed in Club Rules §3.2 as a VIP benefit separate from client referrals, and governed by its own Business Introduction Rules|— (not implemented)|—|Client referral, which moves a **third party's** data and is not covered by those Rules. Confusing the two is the error in [legal-alignment.md C-02](legal-alignment.md#c-02-business-introductions-and-client-referrals-are-two-different-features-and-only-one-is-designed)|
|Business profile|The legal pack's name for what the code calls a `Company` and the interface calls a partner listing|`Company`|`company`|The three words describe one thing at three stages. Use "business profile" only when quoting the legal documents|
|Platform Operator|Kylyvnyk Consulting LLC, a Florida LLC. The legal entity behind KCLUB and the data controller|—|—|KYLYVNYK CLUB, which is the brand. Legal documents name the operator; the interface names the club|
|Client (in a referral)|The third party being introduced. **Not a member and not our user**|`ReferralClient`|`referral.client_*`|A member. This distinction carries the legal weight of the whole feature|
|Consent attestation|The sender's recorded statement that the client agreed to the introduction|`ConsentAttestation`|`referral.consent_*`|Consent given to us by the client — we never obtain that directly|
|Subscription|A recurring payment for VIP membership or for a listing. Owned by Stripe, projected locally|`Subscription`|`subscription`|"Membership", which is free and permanent. A member is not a subscriber|
|Plan|What can be sold: `vip_monthly`, `listing_monthly`, `business`|`Plan`|`plan`|"Tier", which is what a member gets from a plan|
|Price|An amount for a plan, valid from a date. Multiple prices per plan over time|`Price`|`price`|The plan. Changing a price never changes the plan|
|Entitlement|What an active subscription unlocks inside the product|`Entitlement`|`entitlement`|The subscription. Stripe owns subscriptions; we own entitlements|
|Grace period|The 14 days after a failed payment during which access continues. **Derived, not stored** — dunning starts at `subscription.current_period_start` once the status is `past_due`, and the deadline is that plus `GRACE_PERIOD_DAYS`. There is no column; the warning's idempotency comes from the outbox row|`graceAnchorOf`, `GRACE_PERIOD_DAYS`|—|The paid period, which ends at `current_period_end`|
|Moderation|Staff review of a company or a referral before it becomes visible|`moderation` module|`moderation_decision`|"Approval", which is one of its two outcomes|
|Staff|An employee of the club, with a console account. A separate population from members|`StaffUser`|`staff_user`|"Admin", which is one specific staff role|
|Audit entry|An immutable record of something a staff user or the system did|`AuditEntry`|`audit_log`|An application log line, which is diagnostic, short-lived and not evidence|
|Actor|Whoever is performing the current operation: a member, a staff user, or `system`|`Actor`|—|The member. Half of all operations have a non-member actor|
|Outbox row|Committed intent to do something outside the transaction|`OutboxMessage`|`outbox`|A job. The job is what the worker does with the row|
|Environment marker|The one row a database carries saying which environment it _is_: `production`, `dev`, `preview` or `test`. Read by every process at start; a local process refuses `production`|`DatabaseMarker`|`database_environment`|`VERCEL_ENV`, which says where the application runs. The two differ exactly when a laptop is pointed at production, which is the case the marker exists to refuse|

### The three languages

|English (source)|Russian|Ukrainian|Note|
|-|-|-|-|
|Member|Участник|Учасник|Never "пользователь"|
|VIP member|VIP-участник|VIP-учасник|"VIP" stays Latin in all three|
|Membership card|Клубная карта|Клубна картка|Never "пропуск"|
|Email address|Электронная почта|Електронна пошта|Never "имейл" or "мыло" in member-facing text|
|Verified address|Подтверждённый адрес|Підтверджена адреса|Never "активированный" — nothing is activated, an address is proved|
|Partner|Партнёр|Партнер||
|Company|Компания|Компанія||
|Catalogue|Каталог партнёров|Каталог партнерів|Always with "партнёров" — "каталог" alone is ambiguous|
|Discount|Скидка|Знижка||
|Client referral|Рекомендация клиента|Рекомендація клієнта|Never "лид" or "заявка". The legal pack uses this exact wording in Club Rules §3.2|
|Business Introduction|Business Introduction|Business Introduction|Left untranslated in all three languages, as the legal pack does|
|Client|Клиент|Клієнт||
|Subscription|Подписка|Підписка||
|Moderation|Проверка|Перевірка|"Модерация" only in staff-facing text|
|Staff|Команда клуба|Команда клубу||

---

## Rejected and deprecated names

|Old name|Replaced by|Since|Still appears in|
|-|-|-|-|
|Directory|Catalogue|2026-08-02|The client's original brief. "Directory" implies a list of people, which is exactly the thing this product does not have|
|Lead|Referral|2026-08-02|Nowhere in code. Rejected before implementation because it frames the introduced person as a commodity, and because the feature's defensibility rests on it being a personal introduction|
|User|Member (in the domain)|2026-08-02|Framework-level types only (`better-auth` calls its record `user`). The adapter maps it to `Member` at the module boundary, and that mapping is the only place the word may appear|
|Vendor / Merchant|Partner|2026-08-02|Nowhere. Recorded so it is not reintroduced when someone reaches for a synonym|
|Invite|— (no such concept)|2026-08-02|Nowhere. There is no invitation mechanic; anything named "invite" is a misunderstanding of the model and should be challenged in review|

---

## Abbreviations

|Short|Full|Meaning|
|-|-|-|
|KCLUB|KYLYVNYK CLUB|The product. Always uppercase; "K-Club" and "Kclub" are wrong|
|FR-nnn|Functional requirement|An identifier in [requirements.md §4](requirements.md#4-functional-requirements)|
|ADR|Architecture decision record|A file in [decisions/](decisions/)|
|PII|Personally identifiable information|Classified in [security.md §3](security.md#3-data-protection)|
|OTP|One-time password|The 6-digit SMS code|
|TOTP|Time-based one-time password|The authenticator app code, required for staff|
|E.164|ITU-T E.164|The international phone number format we store, e.g. `+14155550123`|
|A2P 10DLC|Application-to-person, 10-digit long code|The US carrier registration required to send SMS from numbers you own. KCLUB does not hold one and does not need one — codes leave from Twilio Verify's pool ([decisions/0010](decisions/0010-no-own-a2p-registration-with-twilio-verify.md))|
|MoR|Merchant of record|The entity legally selling the subscription. Here: us, not Stripe|
|RSC|React Server Component|The default rendering mode|
|SLO / RPO / RTO|Service level objective / recovery point objective / recovery time objective|[reliability.md](reliability.md)|
|MRR|Monthly recurring revenue|Active subscriptions × price, the number in FR-082|

---

## Language conventions

|Where|Language|
|-|-|
|Code identifiers, comments|English|
|Commit messages, pull requests|English|
|Documentation in `docs/`|English|
|User interface|English, Russian, Ukrainian — English is the source; see [ux.md §9](ux.md#9-content-and-tone)|
|Database identifiers|English, `snake_case`, singular table names|
|Team communication|Russian, but every decision that survives the conversation is written down in English|

The last row is the one that causes trouble if left unstated: a decision reached
in Russian in a call and never written in English exists only in the memory of
whoever was on it. The rule is that the meeting can be in any language, the
record cannot.
