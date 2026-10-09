# Glossary

> **Status:** In review
> **Owner:** KCLUB Delivery Lead
> **Last updated:** 2026-10-05
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
|Member|A person whose phone number is verified and who holds a membership card. Pays membership dues unless they are sponsored or predate them ([ADR 0033](decisions/0033-standard-membership-is-paid.md)); VIP includes the dues ([ADR 0043](decisions/0043-vip-includes-membership.md)). Registering also requires an email address ([ADR 0032](decisions/0032-phone-and-email-both-required.md)), but an unproved address makes nobody less of a member — it only leaves them without the recovery channel|`Member`|`member`|"User" — never used in the interface or in domain code. "Customer", which in this codebase means only a Stripe Customer object|
|Verified address|An email address a member has proved by opening the link sent to it, stamped in `email_verified_at`. Only a verified address signs anyone in or receives a reset link|`emailVerifiedAt`|`member.email_verified_at`|The address itself, which is merely claimed until the link is opened|
|VIP member|A member with an active VIP subscription. A tier, not a separate entity|`MemberTier.Vip`|`member.tier`|"Premium", "Gold" — both rejected; "Gold" is the card's colour, not a tier|
|Verification link|A single-use, expiring URL emailed to a member to prove an address is theirs (24 hours) or to let them set a new password (30 minutes). Only its hash is stored ([ADR 0032](decisions/0032-phone-and-email-both-required.md))|`VerificationToken`|`verification_tokens`|"Magic link" — this never signs anyone in on its own; the one-time SMS "code", which Twilio owns and we never store|
|Membership card|The digital proof of membership: a serial, a tier and a QR code. Shown to its holder in one of three faces — member, VIP member, business partner (a member with a live listing) — which are presentation, not tiers; verification still discloses only the tier. The business partner's QR opens their company page instead of the verification page|`MembershipCard`, `CardFace`|`membership_card`|"Pass", "Badge", "Ticket"|
|Card serial|The human-readable identifier printed on the card, shown at verification: the two-letter country of the member's phone number and a club-wide number from 10001 up, `UA-10001` (`card_serial_seq`)|`cardSerial`|`membership_card.serial`|The card's `id` (a UUID, never shown) and the verification token (secret)|
|Verification token|The opaque secret inside the QR code. Stored only as a hash|`verificationToken`|`membership_card.verify_token_hash`|The card serial, which is public and non-secret|
|Partner|A business published in the catalogue with an active listing subscription|`Company` where published|`company`|"Vendor", "Supplier", "Merchant" — none are used. Note the deliberate mismatch: the interface says "partner", the code says `Company`, because a company exists before it is a partner|
|Company|A business record at any stage. The published statuses are fixed by Partner Rules §6: `under_review`, `published`, `hidden`, `suspended`, `removed`, plus the internal `approved` that precedes publication|`Company`|`company`|"Partner", which is a company that has completed all three gates|
|Company draft|An application still being filled in, before it is submitted. Not a company and not a moderation status — it lives in its own table until submission creates the company ([0011](decisions/0011-company-drafts-in-their-own-table.md))|`CompanyDraft`|`company_drafts`|A `Company` with a `draft` status, which is what this deliberately is not|
|Partner owner|The member who owns a company. An attribute of a member, not a separate account|`isPartnerOwner(member)`|derived from `company.owner_member_id`|A staff role. A partner owner has no console access|
|Listing|A published company's presence in the catalogue, and the thing its subscription pays for|`Listing`|derived from `company.status`|The company itself|
|Discount|The benefit a partner promises members, with its conditions|`DiscountTerms`|`company.discount_*`|"Offer", "Deal", "Coupon" — there is no coupon code anywhere in this product|
|Catalogue|The member-only, searchable set of published partners|`catalogue` module|—|"Directory" — rejected, because a directory implies listing people, which we never do. "Marketplace" — rejected, we sell nothing on a partner's behalf|
|Showcase|The curated set of partners visible on the public site|`showcase`|`company.showcase_rank`|The catalogue. The showcase is a marketing surface; the catalogue is the product|
|Referral|A warm introduction of a **client** from one partner company to another. The user-facing English name is "Client referral"|`Referral`|`referral`|**"Business Introduction"** — a different feature entirely (see the next row). "Lead" — rejected, it frames a person as a commodity. "Invitation" — that is a member bringing in another member ([ADR 0042](decisions/0042-member-invite-programme.md)), a different feature|
|Business Introduction|The legal pack's name for introducing two **participants** to each other and exchanging their own contact details, plus networking events. Listed in Club Rules §3.2 as a VIP benefit separate from client referrals, and governed by its own Business Introduction Rules|— (not implemented)|—|Client referral, which moves a **third party's** data and is not covered by those Rules. Confusing the two is the error in [legal-alignment.md C-02](legal-alignment.md#c-02-business-introductions-and-client-referrals-are-two-different-features-and-only-one-is-designed)|
|Business profile|The legal pack's name for what the code calls a `Company` and the interface calls a partner listing|`Company`|`company`|The three words describe one thing at three stages. Use "business profile" only when quoting the legal documents|
|Platform Operator|Kylyvnyk Consulting LLC, a Florida LLC. The legal entity behind KCLUB and the data controller|—|—|KYLYVNYK CLUB, which is the brand. Legal documents name the operator; the interface names the club|
|Client (in a referral)|The third party being introduced. **Not a member and not our user**|`ReferralClient`|`referral.client_*`|A member. This distinction carries the legal weight of the whole feature|
|Consent attestation|The sender's recorded statement that the client agreed to the introduction|`ConsentAttestation`|`referral.consent_*`|Consent given to us by the client — we never obtain that directly|
|Subscription|A recurring payment: membership dues, VIP membership or a listing. Owned by Stripe, projected locally|`Subscription`|`subscription`|Membership itself, which outlives any one subscription — a member whose dues lapse is still a member, they just cannot get in|
|Membership dues|What standard membership costs: $4.99 a month, sold as the `member_monthly` plan ([ADR 0033](decisions/0033-standard-membership-is-paid.md)). A member owes them, is sponsored, or predates them|`membershipAccess`|`members.dues_kind`|The VIP subscription, which includes the dues and adds referrals and priority support ([ADR 0043](decisions/0043-vip-includes-membership.md)) — a member holds one or the other, not both|
|Sponsored membership|Membership whose dues the club waives, because the member joined through the join link or an owner said so. Free for as long as the club says|`dues_kind = "sponsored"`|`members.dues_kind`|A member waived through a member's invite link is sponsored too, and the invitation records who brought them ([ADR 0042](decisions/0042-member-invite-programme.md)). Through the club's join link nobody is credited|
|Join link|The club's current private URL that admits a person with dues waived. One at a time, rotated and revoked by the owner|`JoinLink`|`join_links`|An invite link, which belongs to a member. The join link carries no identity, credits nobody, has no quota and rewards no one for sharing it|
|Partner link|The owner's private URL for businesses: an application filed through it has its listing waived — no card hold, reviewed as usual, free once approved. A `partner` kind of join link. "Партнёрская ссылка" (ru), "Партнерське посилання" (uk) ([ADR 0040](decisions/0040-partner-join-link.md))|`JoinLink` with `kind: "partner"`|`join_links.kind`; `companies.listing_waived_at`|A member's partner invite link. The club's partner link credits nobody and carries no attribution|
|Invite link|A member's personal URL for bringing someone in: kind `member` (to join the club) or `partner` (to apply as a business). One active link of each kind per member, rotated by the member. Whether the newcomer is waived depends on who the member is (the invite matrix). "Реферальная ссылка" (ru), "Реферальне посилання" (uk) ([ADR 0042](decisions/0042-member-invite-programme.md))|`InviteLink`|`invite_links`|A join link, which is the club's anonymous link. A "referral" in code, which is the client introduction of ADR 0009|
|Invitation|The record that one member brought another into the club: one level, written once at registration, with the inviter's standing then and whether anything was waived. The inviter sees only counts|`Invitation`|`invitations`|A downline. There is no second level, no reward, and no view of who the people brought are|
|Consent record|One box a business ticked when applying, stored with the exact words it saw, their version, the route and the time ([ADR 0044](decisions/0044-business-application-consents-and-invite-trial.md)). The evidence of an agreement, not a preference|`consent_records`|`consent_records`|"Checkbox", "opt-in" — those are the control and the marketing case; this is the record|
|Payment authority|The separate consent to the route's charges — a free month then monthly, a reservation then monthly, or a saved card charged at publication. Without it no Checkout opens|`payment_authority`|`consent_records.kind`|Accepting the Terms, which is a different box and is never a substitute|
|Free month (invite route)|One calendar month of a listing without charge, counted from publication, for a business brought through a member's partner link; then the listing price monthly until cancelled ([ADR 0044](decisions/0044-business-application-consents-and-invite-trial.md))|`ApplicationRoute = "invite"`|`listing_activations.free_month`|"Trial" in the interface, which reads as a product demo; "free listing", which is the club link's permanent waiver|
|Listing activation|The start of a listing paid by a saved card: card saved, published, subscription started|`listing_activations`|`listing_activations`|Listing hold, which reserves the price instead|
|Invite matrix|Who brings whom free: a business partner whose listing is paid with money, or a VIP, waives both a member's dues and a business's listing; a club member waives a listing only, and the member they bring pays|`inviteGrantsWaiver`|— (code, `src/domain/invites.ts`)|A rule in the data; it is one function so that it can change|
|Partner account|An account created by the business application: it owes no membership dues, and the club opens for it when its listing subscription is active ([ADR 0036](decisions/0036-payment-after-moderation.md))|`dues_kind = "partner"`|`members.dues_kind`|A `Company`, which is the business itself, and a partner owner, which is an ordinary member who happens to own one|
|Listing hold|The listing price authorised on a partner's card at application: charged when a moderator approves, released when one rejects. "Холд / резерв" (ru), "холд / резерв" (uk) ([ADR 0037](decisions/0037-card-held-at-application.md))|`ListingHold`|`listing_holds`|A payment — until Stripe confirms the capture, nothing has been paid|
|Awaiting payment|A submitted company with no capturable listing hold: not in the moderation queue, not counted, and not approvable until the partner reserves the fee. "Ожидает оплаты" (ru), "Очікує оплати" (uk) ([ADR 0037](decisions/0037-card-held-at-application.md), FR-113)|`awaiting_payment` (admin filter)|— (derived: `moderation_status = pending` with no capturable hold)|"Pending", "unpaid" or "draft" — it is not in review, and nothing is owed yet|
|Special privileges|A partner's offer to members beyond a discount, with an optional note saying what. "Особые привилегии" (ru), "Особливі привілеї" (uk)|`specialPrivileges`|`companies.special_privileges`, `special_privileges_note`|The discount, which is a separate field|
|Partner QR code|A QR code of a published partner's own page, for the partner to print. "QR-код партнёра" (ru), "QR-код партнера" (uk)|`PartnerQr`|—|The membership card's QR code, which verifies a member|
|Partner application|The single-page form a business fills in to be listed, which creates the account and the company in one submit|`submitCompany`, `/partner`|`companies`, `company_drafts`|Registration, which is how a person joins the club. A business applying is not joining|
|Page banner|The first photo of a company's gallery, shown whole across the top of its catalogue page in a 3:1 panel and framed to that shape at upload ([ADR 0038](decisions/0038-partner-images-whole-and-filling.md), [ADR 0039](decisions/0039-framing-images-at-upload.md))|`coverImage` (page), `"banner"` (`CropKind`)|the first `company_images` row|"Cover" in the interface; a gallery photo, which is framed 4:3|
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
|Membership dues|Членский взнос|Членський внесок|Never "абонплата" — the club has members, not subscribers|
|Sponsored membership|Спонсируемое членство|Спонсоване членство|Never "приглашение" — the dues are waived, whoever brought the member|
|Join link|Ссылка для вступления|Посилання для вступу|Never "инвайт" or "реферальная ссылка" — that is a member's invite link|
|Partner link|Партнёрская ссылка|Партнерське посилання|Never "реферальная ссылка"|
|Invite link|Реферальная ссылка|Реферальне посилання|The cabinet section is "Реферальная программа" / "Реферальна програма" ("Invite programme" in en). Never "инвайт"|
|Partner account|Аккаунт партнёра|Акаунт партнера|Never "бизнес-членство" — a partner is not a club member and owes no dues|
|Partner application|Заявка партнёра|Заявка партнера|Never "регистрация бизнеса" in member-facing text — the business applies, we decide|
|Page banner|Баннер страницы|Банер сторінки|Never "обложка" in partner-facing text|
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
|Invite|Invite link, invitation|2026-10-05|Was "no such concept" from 2026-08-02. [ADR 0042](decisions/0042-member-invite-programme.md) introduced personal invite links with one-level attribution|

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
