# Standard membership becomes paid — design

**Date:** 2026-09-09 · **Status:** agreed with the client, not yet implemented ·
**Owner:** solo build

Standard membership is free today: anyone who registers is a `member`, and the
only thing sold to a member is the VIP subscription at $19.99/month (FR-050).
The client has decided that standard membership costs **$4.99 per month**, and
that registration through a **private join link** is free instead.

This document is the agreed design. It is the input to ADR 0033 and to the new
FR numbers; where the two disagree once written, the ADR and `requirements.md`
win.

---

## 1. What was decided

|Question|Decision|
|-|-|
|Recurring or one-off|Monthly subscription, like the two that already exist|
|Relationship to VIP|Unchanged. VIP stays $19.99/month, on top|
|Members who registered before the rule|Free permanently — not asked to pay|
|Account before payment|Created, then held on a payment screen|
|Join link|Free membership, no payment screen ever; the owner rotates the link by hand|
|Access while unpaid|Nothing but the payment screen (option A, the hard gate)|

---

## 2. The model

A member's standard membership is one of three kinds, stored on the row:

|`dues_kind`|Who|Pays|Sees the payment screen|
|-|-|-|-|
|`paying`|Everyone who registers from now on through the ordinary form|$4.99/month|Until Stripe says the subscription is live|
|`sponsored`|Registered through the join link|Nothing|Never|
|`legacy_free`|Every member that existed before the migration|Nothing|Never|

`dues_kind` says **who owes money**, never **whether they are paid up**. Whether
a `paying` member currently has access is a question only Stripe can answer, and
it is answered the way ADR 0004 requires: from the projected subscription rows,
never from a checkout redirect and never from client state.

**Naming.** There is no invite here, and the word is not used. The link is a
**join link**, the membership it grants is **sponsored membership**, and nobody
is rewarded for handing the link to anyone — no code per member, no downline, no
quota, no commission. That is what keeps ADR 0009 intact.

---

## 3. Data

```sql
create type member_dues_kind as enum ('paying', 'sponsored', 'legacy_free');

alter table members
  add column dues_kind member_dues_kind not null default 'paying';

-- Everyone who is already here keeps what they were promised.
update members set dues_kind = 'legacy_free';

create table join_links (
  id           uuid primary key default gen_random_uuid(),
  secret       text not null unique,
  active       boolean not null default true,
  created_by   uuid references members(id) on delete set null,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz
);
```

The `default 'paying'` is deliberate: a row inserted by a future code path that
forgets this column owes money rather than getting in free.

The secret is stored in clear. It is a shared password for a door, printed in
newsletters and read out loud — not a credential belonging to a person — and the
owner has to be able to read the current one back in the console. Hashing it
would buy nothing and cost the console screen. That trade goes in the ADR.

`plan_prices` needs no schema change: it is keyed by a free-text `plan`, and the
new key is `member_monthly` beside `vip_monthly` and `listing_monthly`.

**Retention.** `dues_kind` is not personal data; it dies with the member row.
`join_links` holds no personal data at all.

---

## 4. Domain

One pure function, in `src/domain/membership.ts`, so the rule can be tested
without a database:

```ts
export type MembershipAccess = "active" | "awaiting_payment";

export function membershipAccess(
  member: { duesKind: MemberDuesKind },
  subscriptions: readonly { plan: PlanKey; status: string }[],
): MembershipAccess;
```

- `sponsored` and `legacy_free` are always `active`.
- `paying` is `active` while a `member_monthly` subscription is in a status that
  Stripe considers paid, using the same status set the card tier already uses
  (`tierForSubscriptionStatus` in `src/data/billing.ts`) so that one table of
  statuses governs both, and a member in the grace window keeps access exactly
  as their card keeps its tier.
- Anything else is `awaiting_payment`.

Card tier stays `free | vip`. Dues do not change the tier: a paid-up standard
member holds a free-tier card, exactly as today.

---

## 5. Flows

**Ordinary registration.** The form is unchanged. `registerAction` writes
`dues_kind = 'paying'`, the session is issued as it is today, and the member
lands on the payment screen instead of the profile.

**Payment.** The payment screen starts Stripe Checkout for the `member_monthly`
price, resolved through `checkoutPriceIdForPlan` — the `plan_prices` row wins
over any environment variable, as it already does for the other two plans. The
return from Checkout grants nothing. Access appears when
`customer.subscription.created/updated` is projected, which is seconds later and
is the only path.

**Join link.** `GET /{locale}/join/{secret}` looks the secret up among active
rows. A match sets a short-lived signed cookie — the mechanism
`PENDING_IDENTITY_COOKIE` already uses for Google — and redirects to the
registration form; a miss redirects to the ordinary form with no explanation,
because a probe must not learn whether a secret exists. `registerAction` reads
the cookie server-side and writes `dues_kind = 'sponsored'`. The secret in the
URL is never trusted at submit time.

**Lapse.** When the membership subscription goes unpaid past its grace window,
the existing lapse sweep already flips the projection; `membershipAccess`
therefore returns `awaiting_payment` at the next request, and the member is back
on the payment screen. Money and access do not disagree in either direction.

**VIP.** Untouched. A member must be paid up on standard membership to reach the
VIP checkout at all, which falls out of the gate rather than being coded twice.

---

## 6. Screens

|Screen|State|Notes|
|-|-|-|
|`/{locale}/membership`|The payment screen|Price, what membership includes, one button to Checkout, a link to Pricing, sign out. Outside `(dashboard)`, because a screen inside the gated layout would redirect to itself|
|Dashboard layout|Gate|Anything else under `(dashboard)` redirects here while `awaiting_payment`, including the admin subtree for a member-role actor|
|Console → Join link|`staff_owner` only|The current link, a Rotate button and a Revoke button. Deliberately no count of who came through it: that is attribution, and attribution is the first step towards the referral programme this product refuses to be|

Every string in `en`, `ru` and `uk`. The payment screen says what is being
charged, in USD with an explicit `$`, per `requirements.md` §4.5's rule.

---

## 7. What is deliberately not built

- No per-member codes, no attribution of who shared the link, no reward for
  sharing it, no quota. The link is a door, not a referral programme.
- No proration or plan switching between $4.99 and VIP. They are two
  subscriptions, as they are today.
- No trial period, no dunning emails beyond the payment-failure mail that
  already exists for VIP — it becomes plan-agnostic rather than new.
- No self-service downgrade from `sponsored` to `paying`. The owner changes a
  member's dues kind from the console if it ever comes up.

---

## 8. Tests

|Level|What it proves|
|-|-|
|Unit (`src/domain/membership.test.ts`)|Every `dues_kind` × subscription status combination, named by FR|
|Integration|Ordinary registration lands on the payment screen; join-link registration does not; a projected subscription opens the gate; a lapsed one closes it; a revoked link stops working|
|Integration|`legacy_free` members keep access with no subscription at all|
|Constraint|The gate is enforced in one place and the member-leak walker still passes; rotating the link writes an audit entry|
|Stripe lifecycle|`member_monthly` created → active → past_due → canceled, against a test clock, mirroring the VIP suite|

---

## 9. Documentation this change owes

|Document|What|
|-|-|
|`decisions/0033-…`|Standard membership is paid; sponsored access; why the secret is stored in clear; why this is not an invite mechanic|
|`requirements.md`|FR-102…FR-108 (below), §3 role table, §4.5 pricing, §6.1 phase mapping|
|`glossary.md`|**Membership dues**, **sponsored membership**, **join link** — en/ru/uk|
|`ux.md`|The payment screen, the gate, the console screen|
|`data-storage.md`|`members.dues_kind`, `join_links`|
|`operations.md`|How the owner rotates the join link; how a price change works|
|`integration.md`|The third Stripe product|

Draft requirements:

|FR|Text|Actor|
|-|-|-|
|FR-102|The system must sell standard membership as a monthly subscription at the price configured for the `member_monthly` plan (launch price $4.99/month) through Stripe Checkout|member|
|FR-103|A member whose standard membership is neither paid nor sponsored must reach no member surface other than the payment screen|member|
|FR-104|Membership access must be projected from Stripe subscription events; a return from Checkout must never grant it|system|
|FR-105|Registration through an active join link must create a sponsored member, who is never asked to pay and never shown the payment screen|member|
|FR-106|`staff_owner` must be able to read, rotate and revoke the join link in the console, and every such change must write an audit entry|staff_owner|
|FR-107|Members who registered before this rule must keep free access permanently|member|
|FR-108|Access must follow the subscription within 60 seconds of its state changing, in both directions|system|

---

## 10. Delivery

Four changes, in this order, each under ~400 lines and each shippable alone:

1. **Documents.** ADR 0033, the FRs, glossary, ux, data-storage rows. No code.
2. **Backend.** Migration, `dues_kind`, `join_links`, `membershipAccess`, the
   `member_monthly` plan in the seed and in `CheckoutPlan`, projection wiring,
   unit and integration tests. Nothing user-visible yet.
3. **The gate and the payment screen.** Dashboard layout gate, the screen, three
   locales, integration tests.
4. **The join link.** The route, the cookie, the console screen, the audit entry,
   tests.

Only step 3 changes what an existing member sees, and by then `legacy_free` is
already in place — so no member who is here today is ever shown a bill.
