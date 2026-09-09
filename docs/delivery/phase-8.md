# Phase 8 — Membership dues

**Goal, from [requirements.md §6.1](../requirements.md#61-delivery-plan):**
standard membership sells and lapses against a Stripe test clock; a join link
admits a member free; nobody who was already here is ever billed.

**Exit criterion, verbatim:** _Standard membership sells and lapses against a
Stripe test clock; a join link admits a member free; nobody who was already here
is ever billed._

The decision is [ADR 0033](../decisions/0033-standard-membership-is-paid.md) and
the design it came from is
[plans/2026-09-09-membership-dues-design.md](../plans/2026-09-09-membership-dues-design.md).
What already exists and is reused rather than rebuilt:

- The billing lifecycle is complete for two plans (phase 3). Adding a third is a
  plan key, a price row and a `CheckoutPlan` member — the webhook, the outbox
  projection, the watermark, the lapse sweep, the grace window and the daily
  reconciliation are plan-agnostic already.
- `plan_prices` is keyed by a free-text plan, so `member_monthly` needs no
  migration there and the owner changes its price on the screen that already
  changes the other two (FR-059).
- The signed-cookie mechanism the join link needs is the one
  [ADR 0029](../decisions/0029-google-sign-in.md) built to carry a proved Google
  identity across the registration form.

## 1. Tasks

|Task|Delivers|FR|Depends on|Est|Status|
|-|-|-|-|-|-|
|T-8.1|The record: ADR 0033, FR-102…FR-108, the role table, the pricing bullet, glossary rows in three languages, the screens in ux.md, the columns and retention in data-storage.md|—|—|0.5d|done 2026-09-09|
|T-8.2|Migration and domain: `members.dues_kind` defaulting to `paying` with every existing row backfilled `legacy_free`, `join_links`, the pure `membershipAccess` over the member row and their subscriptions, `member_monthly` in `CheckoutPlan` and in the seed, and the checkout action that sells it|FR-102, FR-104, FR-107, FR-108|—|1.5d|done 2026-09-09 — migration `20260909120000_membership_dues`; `subscriptions.plan` added in the same change because "a member subscription with no company is VIP" stopped being true the moment dues became one, and every member paying $4.99 would have read as VIP; 12 unit tests over `membershipAccess`, 4 over the price table|
|T-8.3|The gate and the dues screen: one redirect in the dashboard layout, the payment screen in three locales, and the tests that prove every other member surface refuses an unpaid member|FR-103|T-8.2|1d|done 2026-09-09 — gate in `(dashboard)/dashboard/layout.tsx`, screen at `/{locale}/membership` (outside the gated layout, or it would redirect to itself), staff exempt. Verified in a browser against the docker stack: registration lands on the dues screen, `/dashboard/profile` bounces back to it. **Integration tests are still owed** — Testcontainers needs a Docker socket this stack does not have|
|T-8.4|The join link: `/{locale}/join/{secret}`, the signed cookie read server-side at registration, and the console screen where `staff_owner` reads, rotates and revokes it with an audit entry each time|FR-105, FR-106|T-8.2|1d|done 2026-09-09 — route stamps a signed cookie and forwards with a _relative_ Location (an absolute one built from `request.url` sends the browser to the bound address and loses the cookie); registration re-checks the link is still active, so revoking takes effect at once. Verified in a browser: sponsored registration goes straight in, an unknown secret says nothing, rotating replaces the link and the old one stops stamping a cookie, and the rotation wrote an audit entry|
|T-8.5|Public pricing page reachable from the main navigation, amounts from one table; a way home from the 404|—|T-8.2|0.5d|done 2026-09-09 — `/{locale}/pricing` with all three plans, linked from the header and from the dues screen; amounts in `src/domain/pricing.ts` (integer minor units) rather than in nine translation strings; localised `not-found.tsx` with one button home, plus a root one for paths that never reached a locale|

## 2. Rollout

In this order. Each step is safe on its own; the order is what keeps money and
access agreeing.

1. **The migration applies itself** during the production build
   (`tools/vercel-build.ts`), before the deployment is promoted. It adds
   `members.dues_kind`, `subscriptions.plan` and `join_links`, marks every
   existing member `legacy_free` in the same statement that adds the column,
   and backfills `plan` from whether a company is attached. Additive
   throughout, so the version still serving traffic during the build does not
   notice it.
2. **Set `STRIPE_MEMBER_PRICE_ID`** in the production environment to the live
   `price_…` of the $4.99 monthly price, and redeploy so the variable is read.
   Before the first sale, not after: a price the projection cannot recognise
   falls back to `vip`, and a member paying dues would be granted the VIP
   entitlement. `pnpm env:check:production` refuses a deployment without it.
3. **Deploy.**
4. **Smoke it** — `pnpm smoke:deployment https://www.kylyvnyk.club
--expect-database-environment production`, then open `/en/pricing` and
   confirm it says $4.99.
5. **Create the join link** in the console (Platform → Join link → Create).
   Until one exists, every registration pays.

## 3. Still owed

- **Integration tests** for the gate, the projection of a `member_monthly`
  subscription and the join link. The suite needs a Docker socket for
  Testcontainers, which the container this was built in does not have; the
  browser checks above cover the same paths but do not run in CI.
- **The console does not show a member's dues kind.** Staff see the three plan
  chips (VIP, listing, neither) exactly as before, so a member paying dues reads
  as "free" there. Honest but incomplete, and worth a row of its own.
- **There is no console screen for prices at all.** `setPlanPriceAction` exists
  and now accepts `membership`, but nothing calls it — FR-059's interface was
  never built, so the membership price can only be set by the environment
  variable, which is a redeploy rather than a decision.
- **A price change in the console does not change the published amounts.**
  `plan_prices` decides what Stripe charges; `src/domain/pricing.ts` decides
  what the pages say. Changing one without the other makes the copy lie.

## 4. What this phase must not do

- **No invitation mechanic.** The join link credits nobody, counts nobody's
  introductions and rewards no one for sharing it. Anything that starts to
  attribute a sponsored member to the person who shared the link is a different
  decision and needs its own record
  ([ADR 0009](../decisions/0009-referral-data-minimisation.md)).
- **No entitlement from a redirect.** The return from Stripe Checkout renders a
  page and grants nothing, exactly as the VIP and listing returns already do
  ([ADR 0004](../decisions/0004-stripe-billing-as-system-of-record.md)).
- **No bill to an existing member.** `legacy_free` is written by the migration
  itself, in the same statement that adds the column, so there is no window in
  which a member who was already here is `paying`.
