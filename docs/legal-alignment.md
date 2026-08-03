# Legal Alignment

> **Status:** In review
> **Owner:** _(fill in)_
> **Last updated:** 2026-08-02
> **Write when:** legal documents exist that the product must implement. Delete
> this document when every row is closed — it is a reconciliation register, not
> a permanent description.

The client supplied nine executed legal documents in [policy/](policy/), all
version 1.0, effective 2026-07-01, operator **Kylyvnyk Consulting LLC** (a
Florida limited liability company, 6 Pauline Pl, Palm Coast, FL 32164-7535,
United States).

They were written before the system design and they do not match it. That is
normal and it is why this document exists. What is not normal is shipping code
against one and publishing the other: the legal pack is what the club has
promised in writing, and the design is what the software will actually do. Where
those differ, someone must decide which one moves.

**Reading order:** §1 is what the legal pack settles — facts the design simply
adopts, several of which close open questions in [brief.md](brief.md). §2 is the
conflicts, ranked by cost of getting them wrong. §3 is defects inside the legal
pack itself. §4 is the decision log.

**One structural note before the detail.** Across all nine documents the
operative verb is "may" (_вправе_, _может_): the platform may verify, may
request documents, may provide Business Introductions, may use marketing
cookies. That drafting is deliberate and it is good for the operator — it grants
latitude without creating obligations. But it means **the legal pack is not a
specification**. It describes the maximum the club is permitted to do, not what
it will do. The design decides what is actually built, and the only real
conflicts are where the design does something the pack forbids, or promises
something the pack has not authorised.

---

## 1. What the legal pack settles

Each of these is now a fact. Where a row closes an open question, the source
document is updated in the same change.

|#|Fact|Source|Effect on the design|
|-|-|-|-|
|L-01|Operator is **Kylyvnyk Consulting LLC**, a Florida LLC, at 6 Pauline Pl, Palm Coast, FL 32164-7535, US|All nine|Closes the first open question in [brief.md](brief.md#open-questions). Stripe account is US/Florida; sales-tax nexus is Florida; the club is merchant of record, as assumed in [decisions/0004](decisions/0004-stripe-billing-as-system-of-record.md)|
|L-02|Governing law is **Florida**, disputes go to **binding individual arbitration**, with a **class-action waiver**|Terms §28–30|Recorded in [requirements.md §5.5](requirements.md#55-compliance-and-legal). Arbitration and the waiver need an explicit, separately-acknowledged checkbox at registration to be enforceable in the US — a product requirement, not just a legal one|
|L-03|**The English version prevails** over every translation|All nine, final section|Confirms [ux.md §9](ux.md#9-content-and-tone): English is the source locale. The legal pages must carry this notice in the Russian and Ukrainian renderings|
|L-04|Minimum age is **18**, or the age of majority where the user lives|Terms §9.1, Club Rules §2, Privacy §20|Attestation at registration, recorded with the accepted document versions|
|L-05|**Refunds are not given** as a rule. Discretionary consideration only for: double charge, platform technical error, unauthorised charge, mistaken payment, or where law requires it|Refund Policy §6, Terms §13|Closes the refunds open question. No self-serve refund; staff issue them in Stripe. Dissatisfaction, non-use, no clients, rejected business profile and removed profile are all explicitly **not** grounds|
|L-06|Prohibited activity is enumerated: gambling, cryptocurrency projects and tokens, unlicensed financial services, high-risk investment offers, weapons, adult material, IP infringement, fraud, spam, scraping, bots, multiple accounts to evade limits|Terms §15, Club Rules §11|Closes the prohibited-categories open question. This list becomes the moderation reject-reason enum and the category blocklist in FR-041|
|L-07|Business profile statuses are **UNDER REVIEW, PUBLISHED, HIDDEN, SUSPENDED, REMOVED**|Partner Rules §6|The state machine in [architecture.md §3.3](architecture.md#33-partner-onboarding-to-publication) gains `suspended` and `removed`. See D-07 for the internal contradiction|
|L-08|Deleting an account **does not** cancel a subscription|Terms §12|A product requirement with real support consequences: the deletion flow must show the active subscription and require an explicit choice. Silently continuing to bill a deleted account is a chargeback and a complaint|
|L-09|Price changes apply only to new payments; the paid period is never repriced|Terms §10, Refund §9|Confirms FR-059 exactly as designed|
|L-10|Liability is capped at fees paid in the **preceding three calendar months**|Terms §23, Club Rules §15, Partner Rules §15, BI Rules §10|No engineering effect. Recorded because it sets what a defect can cost, which is what the reliability targets are ultimately protecting|
|L-11|The partner **must honour** a published special condition to a member holding a valid card who meets the stated terms, and may not refuse arbitrarily|Terms §8, Partner Rules §7|Stronger than the brief implied. The offer's restrictions (validity, territory, booking, minimum order) must be structured fields, not free text, because the partner is bound by what is published|
|L-12|Partners may be legal entities, sole traders, self-employed persons, licensed professionals, consultants, non-profits, and public bodies|Partner Rules §2|The onboarding form cannot assume a registered company. "Legal name" and "registration number" must be optional per partner type|
|L-13|Chargebacks may trigger suspension of membership, Business Introductions and other functions|Refund §8|Changes the design's `charge.dispute.created` handling from "flag for review, do not withdraw access" to "flag, and allow staff to suspend". Automatic suspension is still not recommended — see D-05|
|L-14|Electronic notices are accepted as legally sufficient|Terms §26, Contact §11|Justifies in-product notification as the authoritative channel, with email and SMS as delivery|

---

## 2. Conflicts

Ranked by what it costs to discover the answer late. Each names the decision
that must be made and by whom; none can be resolved by an engineer.

### C-01 — Closed chats and groups contradict "no member directory"

**Severity:** blocking

**The pack says** VIP members get access to closed groups, closed chats, closed
meetings, and business, educational and networking events
(Club Rules §3.2). Business Introductions include introducing two participants
to each other and exchanging their contact information (BI Rules §2, §4).

**The design says** there is no member directory, no member search and no
member-to-member messaging, enforced structurally: no repository function
returns a set of members to a member-scoped actor, and a generated test fails
the build if one appears
([decisions/0005](decisions/0005-no-member-directory.md)).

These cannot both be true. A closed chat requires addressing a member; a
networking event requires an attendee list; introducing two participants
requires showing one to the other.

**This is the single most consequential row in this document**, because ADR 0005
is not a preference — it is the constraint the whole data layer was built to
enforce, and the brief called the absence of a member list the product's
differentiator.

**Options:**

1. **Keep ADR 0005; treat groups, chats and events as unbuilt options.** The
   pack says the platform "may" provide them, not that it will. Nothing is
   breached by not building them. Recommended: it preserves the product's
   positioning, and the pack's permissive drafting already covers it.
2. **Build member-to-member introductions as a double-opt-in exchange.** Neither
   party is listed or searchable; a member may only be reached through a
   moderated introduction, and contact details are exchanged only after both
   accept. This is compatible with ADR 0005's spirit and would need the ADR
   superseded and the enforcement test narrowed — carefully, because the test is
   the control.
3. **Drop ADR 0005 and build a member network.** A different product from the
   one in [brief.md](brief.md), and the marketing claim "we never publish our
   member list" would have to go.

**Decision needed from:** client. **By:** before phase 1 ends — the data layer's
shape depends on it.

### C-02 — "Business Introductions" and "client referrals" are two different features, and only one is designed

**Severity:** blocking

**The pack** treats them separately. Club Rules §3.2 lists, as distinct VIP
benefits, "участие в системе Business Introductions" **and** "возможность
рекомендовать клиентов другим участникам и партнёрам". Business Introduction
Rules then define Business Introductions as participant-to-participant
networking — and say explicitly that a Business Introduction "не является
продажей клиента, продажей лида" (BI Rules §2).

**The design** implements only the second one: a VIP member with a published
company sends a third party's contact details to another published company,
under quota, with a recorded consent attestation
([decisions/0009](decisions/0009-referral-data-minimisation.md)).

So the designed feature is not the one the Business Introduction Rules govern,
and the feature those Rules govern is not designed.

**Consequence, and it is the serious one:** the client-referral feature — the
one being built — moves personal data about a **non-user third party** between
two businesses. Nothing in the nine documents authorises that. BI Rules §9
addresses only participants deciding to share **their own** contact details, and
§7 forbids "использовать чужие контактные данные без разрешения". The consent
attestation the design relies on has no basis in the published rules.

**Required:** either the Business Introduction Rules gain a section covering
third-party client referrals — consent, minimisation, retention, the referred
person's rights and how they exercise them — or the feature does not ship. The
design already implements the controls; what is missing is the published
promise that matches them.

**Decision needed from:** client + counsel. **By:** before phase 6 starts.

### C-03 — The pack authorises marketing cookies and third-party trackers; the design has none

**Severity:** high

**The pack** lists Analytics, Performance, Marketing and Third-Party cookies,
including advertising platforms, pixels, tags, SDKs and advertising identifiers
(Cookie Policy §3, §5, §7, §8; Privacy §9, §10).

**The design** has no third-party scripts at all. That is not incidental — it is
what makes three other things work: a strict `default-src 'self'` CSP with no
`unsafe-inline` ([security.md §6](security.md#6-application-security-controls)),
the absence of a cookie consent banner
([security.md §8](security.md#8-compliance)), and the CCPA statement that we do
not sell or share personal information
([requirements.md §5.5](requirements.md#55-compliance-and-legal)).

Adding one advertising pixel costs all three at once, and under CPRA sharing
personal information with an advertising platform for cross-context behavioural
advertising requires a "Do Not Sell or Share My Personal Information" link that
the pack does not currently promise.

**Recommendation:** keep the product tracker-free and narrow the Cookie Policy to
essential and functional cookies plus first-party analytics. If marketing
attribution is commercially necessary, use server-side, first-party measurement
before reaching for a pixel. **Decision needed from:** client.

### C-04 — The Privacy Policy authorises collecting far more personal data than the product collects

**Severity:** high

**The pack** lists: email, Telegram username, WhatsApp number, social links, date
of birth, postal address, profile photo, precise GPS location, identity
documents, proof of address, video identity confirmation, business registration
documents, licences, certificates, and KYC data generally (Privacy §4, §5, §8,
§13; Club Rules §5; Partner Rules §4, §5).

**The design** collects a phone number, a display name, a preferred language and
a country — and treats that minimalism as a feature.

There is no legal conflict: collecting less than a policy permits is always
allowed. There is a **product and credibility conflict**, and two concrete
engineering consequences if any of it is actually built:

- **Identity and licence documents are a different class of data.** They need
  encrypted storage separate from the image bucket, strict access control, a
  retention period, a deletion path, and they materially change the breach
  profile — a leak of scanned passports is not the same incident as a leak of
  phone numbers. None of that exists in
  [data-storage.md](data-storage.md), because none of it was in scope.
- **Precise geolocation** requires a permission prompt, a purpose, and its own
  retention rule. It appears nowhere in the design.

**Recommendation:** narrow the Privacy Policy to what is actually collected, and
add categories back as features arrive. A policy that over-declares is not free:
it tells a regulator and a prospective member that the club wanted the data.
**Decision needed from:** client + counsel.

### C-05 — VIP appears to be a prerequisite for submitting a business profile

**Severity:** high

**The pack** lists "возможность подачи заявки на размещение бизнес-профиля" as a
VIP Member benefit (Club Rules §3.2).

**The design** lets any verified member submit a company (FR-040), with the
separate listing subscription paid after approval.

If the pack is right, a partner pays **twice** — VIP at $19.99 plus the listing
at $19.99 — which is a different commercial model from the one in
[brief.md](brief.md), doubles the price of being a partner, and materially
raises the barrier at exactly the point where the cold-start risk lives.

It may equally be loose drafting rather than an intended gate.

**Decision needed from:** client, and it is a pricing decision before it is an
engineering one. **By:** before phase 2 ends.

### C-06 — GDPR is absent from the legal pack

**Severity:** high

The Privacy Policy addresses CCPA/CPRA and states that data may move
internationally, but contains no GDPR section: no lawful basis mapped per
purpose in GDPR terms, no 72-hour supervisory-authority breach notification, no
Article 27 EU representative, no sub-processor list, no reference to Standard
Contractual Clauses for the US transfer, and no data-protection contact beyond a
general mailbox.

**The design assumes GDPR applies** and specifies all of the above
([security.md §8](security.md#8-compliance),
[data-storage.md §4](data-storage.md#4-retention-and-deletion)). The club is
described in the pack itself as an international platform, and the brief targets
members worldwide, so EU residents will join.

**This is a commercial decision, not a technical one.** Either the pack is
extended to cover GDPR, or the club deliberately restricts membership to
non-EU/UK residents — which is enforceable at registration by country, and which
would contradict "международный клуб". Doing neither means operating in the EU
without the paperwork.

**Recommendation:** extend the pack. The design already implements the controls;
the gap is documentary. **Decision needed from:** client + counsel. **By:**
before the first EU sign-up.

### C-07 — Business profile data is described as possibly public and indexable

**Severity:** medium

**The pack** says information a user places in a business profile "может быть
публично доступна другим пользователям платформы, посетителям сайта, поисковым
системам и иным лицам" (Privacy §6).

**The design** makes the catalogue visible only to authenticated members, with a
separately curated public showcase, and applies `noindex` to everything
member-facing (FR-030, FR-035).

Both can be true if the showcase is the public part and the catalogue is not,
but the policy does not draw that line, and a partner reading it cannot tell
where their information will appear. Partners will ask, because it determines
whether a listing is worth $19.99.

**Recommendation:** state the distinction explicitly in the Partner Rules — the
showcase is public, the catalogue is members-only — and reflect it in the
onboarding form so the partner sees which fields are which.

### C-08 — Auto-renewal "without prior notice" is a US regulatory exposure

**Severity:** medium

Terms §11 states that renewal may occur without notice before each charge.

That is written as broadly as the operator can write it, but automatic-renewal
statutes in several US states — California's Automatic Renewal Law is the one
that matters most for a US-focused club — require clear pre-purchase disclosure,
affirmative consent, an accessible online cancellation path, and in some cases a
renewal reminder. Terms §11's own carve-out ("если иное не требуется применимым
законодательством") acknowledges this without resolving it.

**Recommendation, and it is cheap:** send a renewal reminder anyway. The design
already has the notification infrastructure and the subscription dates. Seven
days' notice before each charge costs one scheduled job and removes both the
regulatory exposure and a recurring cause of chargebacks. **Decision needed
from:** client, with counsel confirming the state list.

### C-09 — Card expiry is in the legal text and not in the design

**Severity:** medium

Terms §17 and Club Rules §7 both list "срок действия" among the card's contents.
The design's card has no expiry: it has `valid` / `revoked` states and a tier,
and the verification page reports `expired` as a possible verdict without
anything ever producing it.

Either the card gains an expiry date — which needs a renewal mechanism, a
notification, and a rule for what an expired card means for a free member who
has done nothing wrong — or the legal text drops the field. **Recommendation:**
drop it. An expiring card on a free tier creates a support burden and a moment
where a member is turned away at a counter for no reason.

### C-10 — Contact addresses are consumer Gmail accounts, and they disagree

**Severity:** medium

Eight documents give `kylyvnykclub@gmail.com`. Terms §37 gives
`yurgarantzhitlo@gmail.com`. The design assumes `security@`, `privacy@` and a
monitored `/.well-known/security.txt`
([security.md §9](security.md#9-incident-response),
[CONTRIBUTING.md](../CONTRIBUTING.md#reporting-problems)).

Three separate problems: the two addresses contradict each other; a consumer
Gmail account as the published data-controller contact undermines the premium
positioning the whole product is built on and will be noticed by any partner
doing diligence; and one shared mailbox cannot route a breach report, an erasure
request and a password question to different people with different clocks.

**Recommendation:** domain addresses — `privacy@`, `security@`, `support@`,
`partners@` — before launch, and one correction pass over the pack. Low cost,
and it is the kind of detail that decides whether a partner believes the club is
real.

### C-11 — The Privacy Policy commits to no retention periods

**Severity:** low

It says data is kept "в течение срока, необходимого для достижения целей". The
design commits to specific periods per data class
([data-storage.md §4](data-storage.md#4-retention-and-deletion)), including a
30-day erasure completion.

Not a conflict — the design is stricter than the promise — but publishing the
actual periods is worth more than it costs. It is a concrete, checkable privacy
commitment in a product that sells privacy, and it costs nothing because the
system already behaves that way.

### C-12 — Events, closed meetings and networking have no design at all

**Severity:** low, until C-01 is answered

Club Rules §3.2 and BI Rules §2/§4 describe networking events, business
meetings, educational events and closed meetings. There is no event entity, no
attendance, no invitation and no calendar anywhere in the design.

If events happen off-platform — a founder organising a dinner over email — no
software is needed and this row closes. If they are a platform feature, it is a
phase of work that does not exist in the plan in
[requirements.md §6.1](requirements.md#61-delivery-plan), and it depends on
C-01. **Decision needed from:** client.

### C-13 — Refund Policy references app stores

**Severity:** low

Refund Policy §3 and §8 contemplate payments through app stores. The brief
excludes native applications and the design is web-only
([requirements.md §2](requirements.md#2-scope)).

Harmless as drafted — it is permissive language for a future that may not
arrive — but if native applications are ever genuinely planned, Apple and Google
take 15–30% of a $19.99 subscription and require their own billing for digital
goods. That changes the unit economics enough that it should be a deliberate
decision rather than a sentence in a policy.

---

## 3. Defects inside the legal pack

These are not conflicts with the design. They are errors in the documents
themselves, found while reading them, and each is a five-minute fix that is
embarrassing if a partner finds it first.

|#|Defect|Where|
|-|-|-|
|D-01|Two different contact addresses across the pack|Terms §37 vs. the other eight|
|D-02|Section 10 appears twice, with identical text|Partner Rules|
|D-03|A section heading is truncated mid-word: "25. ФОРС-МАЖО"|Terms|
|D-04|Business profile statuses listed as three (UNDER REVIEW, PUBLISHED, HIDDEN) in one document and five (plus SUSPENDED, REMOVED) in another|Terms §7 vs. Partner Rules §6|
|D-05|Chargeback consequences are stated as platform rights with no stated process, so a member who wins a bank dispute may be silently suspended with no notice|Refund §8|
|D-06|The Partner Rules never mention the listing fee, its amount, or that publication requires an active paid subscription — the core commercial term of the partner relationship is absent|Partner Rules, throughout|
|D-07|Effective date is 2026-07-01, already in the past, for a platform that does not yet exist. Members registering at launch will accept documents dated before the product existed|All nine|
|D-08|The documents are Russian text under English titles, while each declares the English version authoritative — the authoritative version does not appear to exist yet|All nine|
|D-09|Every document is a `.doc` binary in a folder, with no version control, no diff and no way to prove which version a member accepted|[policy/](policy/)|

D-08 and D-09 are the two that matter operationally. FR-093 requires recording
which version of each document a member accepted; that is only meaningful if the
documents are versioned artefacts. **They should be converted to MDX in the
repository** — as
[documentation.md §1](documentation.md#1-documentation-map) already anticipates —
so a version is a commit, a change is a diff, and the acceptance record points at
something immutable.

---

## 4. Decision log

Every row above needs an owner and a date. None is an engineering decision.
The question each row resolves is in §2 (conflicts) or §3 (defects); this table
tracks only ownership, deadline and status.

|#|Owner|Needed by|Status|
|-|-|-|-|
|C-01|Client|Before phase 1 ends|Open|
|C-02|Client + counsel|Before phase 6|Open|
|C-03|Client|Before launch|Open|
|C-04|Client + counsel|Before phase 2|Open|
|C-05|Client|Before phase 2 ends|Open|
|C-06|Client + counsel|Before the first EU sign-up|Open|
|C-07|Client|Before phase 2 ends|Open|
|C-08|Client|Before phase 3 ends|Open — recommended yes|
|C-09|Client|Before phase 1 ends|Open — recommended remove|
|C-10|Client|Before launch|Open|
|C-11|Client|Before launch|Open — recommended yes|
|C-12|Client|Before phase 6|Open|
|C-13|Client|No deadline|Open|
|D-01…D-09|Client + tech lead|Before launch|Open|

When a row closes, the answer goes into the document it belongs in —
[requirements.md](requirements.md) for scope,
[security.md](security.md) for data handling, a record in
[decisions/](decisions/) if it is expensive to reverse — and the row is deleted
from here. This document should shrink to nothing.
