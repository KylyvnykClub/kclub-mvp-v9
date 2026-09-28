# Phase 10 — Card hold and partner page

**Goal, from [requirements.md §6.1](../requirements.md#61-delivery-plan):** the
owner's written specification of 2026-09-26 — hold the listing price at
application, capture it on approval, release it on rejection, publish only on
Stripe's confirmation — plus whole logos, special privileges, and a partner page
with a QR code that works for someone who has never signed in.

**Exit criterion, verbatim:** _A partner's card is held at application, an
approval captures it and publishes the listing only once Stripe confirms the
payment, a rejection releases it, and a published partner's page, logo and QR
code work for a visitor who has never signed in._

The decision is [ADR 0037](../decisions/0037-card-held-at-application.md), which
supersedes decision 4 of [ADR 0036](../decisions/0036-payment-after-moderation.md).

## 1. Tasks

|Task|Delivers|FR|Depends on|Est|Status|
|-|-|-|-|-|-|
|T-10.1|The record: ADR 0037, FR-113…FR-118, the amended FR-044, FR-052, FR-110 and FR-111, `listing_holds` in data-storage.md, the `payment_intent.*` events in integration.md, the webhook and receipt settings in operations.md, glossary rows|—|—|0.5d|done 2026-09-26|
|T-10.2|The hold: `listing_holds` and its migration, Checkout in `payment` mode with a manually captured PaymentIntent, the webhook routing `payment_intent.*` to the outbox, and the projection that re-reads the PaymentIntent from Stripe|FR-113|—|1d|done 2026-09-26 — `tests/listing-hold.integration.test.ts` (holds recorded and not published, one checkout at a time, another member's company refused, duplicate delivery projected once, a forged `succeeded` payload publishes nothing); migration proved up, down and up on PostgreSQL 17|
|T-10.3|Approve captures, reject cancels, the webhook publishes: `planListingHoldSettlement` in `src/domain/listing-hold.ts` run by the moderation action, the webhook worker and an outbox retry; "paid" as one rule for the catalogue, the partner page, the sitemap, the image routes, the admin badge and the partner's club access|FR-114, FR-115|T-10.2|1d|done 2026-09-26 — 38 unit tests over the rule and its standings; integration tests for approve → capture → `succeeded` → published, a lapsed or past-deadline hold never captured, a refused capture leaving the listing unpublished, a repeated settlement asking Stripe for nothing, reject → cancel, a hold authorised after rejection cancelled, a live listing rejected later refunded once. Mutating the "paid" rule to count an uncaptured hold fails four of them|
|T-10.4|The monthly subscription after the first confirmed capture, anchored at the end of the paid month, `charge_automatically`|FR-116|T-10.3|0.5d|done 2026-09-26 — integration test asserts one subscription, keyed per PaymentIntent, from the saved card. **Not run against Stripe test mode**: this host has a placeholder key|
|T-10.5|The partner screen and the console: reserve / held (with the bank's deadline) / confirming / pay / rejected on `/membership`; the moderator sees what is on the card before deciding, and what happened to it after; the approval and rejection notices say what happened to the money (serves FR-113 to FR-115, owned by T-10.2 and T-10.3)|—|T-10.3|0.5d|done 2026-09-26 — copy in three locales; not walked in a browser|
|T-10.6|Special privileges: switch and optional note on both application forms, shown on the catalogue card, the landing cards, the partner page, the owner's and staff's views|FR-117|—|0.5d|done 2026-09-26 — landing card field-list test updated; not walked in a browser|
|T-10.8|The owner's decisions of 2026-09-27: a member's own company is paid for the same way (reserve in Profile → Companies, the subscription checkout after approval removed), and the partner page shows the business's contact details to everyone|FR-119|T-10.3|0.5d|done 2026-09-27 — integration tests for a member reserving, being approved and published only on confirmation, and an already approved company captured as soon as its reservation lands|
|T-10.7|Logos whole and the partner page public: logo upload no longer cropped (4 unit tests), contained on a dark plate in the site's palette everywhere it is shown (a light plate first, changed at the owner's request 2026-09-27); gallery photos of a published company served to guests; the owner's QR code with language choice and PNG download|FR-118|—|0.5d|done 2026-09-26 — not walked in a browser|
|T-10.9|The owner's decisions of 2026-09-28 ([ADR 0038](../decisions/0038-partner-images-whole-and-filling.md)): every logo and photo shown whole and filling its box (`FilledImage`) on the catalogue card, the landing cards, the partner banner and gallery, and the owner's previews; logos stored up to 1024px and photos up to 2560px; upload hints give the shape and size; the partner banner carries only the country flag (no other badges, no logo plate, no printed name); the landing's club figures hidden for now (serves FR-118, owned by T-10.7)|—|T-10.7|0.5d|done 2026-09-28 — image-processing unit tests updated to the new bounds; not walked in a browser|

## 2. Rollout

1. **Stripe dashboard, before the deploy:** add
   `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`,
   `payment_intent.payment_failed`, `payment_intent.canceled` and
   `payment_intent.processing` to the production webhook endpoint. Without them
   no hold is ever recorded and no approval ever captures. Switch on "Email
   customers about successful payments" and, if wanted, Apple Pay / Google Pay
   under payment methods.
2. **The migration applies itself** during the build (`listing_holds`, two
   `companies` columns). Nothing existing is rewritten.
3. **Walk it in test mode first:** apply on `/partner` → reserve with `4242…`
   → the moderation queue shows "card reserved" → approve → the listing goes
   live within a minute → the Stripe dashboard shows one captured payment and
   one subscription whose next invoice is a month away. Again with reject: the
   PaymentIntent is `canceled`, nothing captured.
4. **Tell partners with a cropped logo** to upload it again.

## 3. Still owed

- **Nothing here has touched real Stripe.** The key in `.env.local` is a
  placeholder, so the Stripe side is a faithful fake. The parameters are
  Stripe's documented ones, but `billing_cycle_anchor` with `proration_behavior
= none` and Checkout's manual capture must be confirmed in test mode (rollout
  step 3) before production.
- **No browser walk.** The partner screens, the console's payment panel, the
  privileges switch, the logo plates and the QR panel were typechecked, linted
  and built, not seen.
- **A lapsed hold is not announced.** When an authorisation lapses during
  review the partner's screen asks them to reserve again, but no email tells
  them to look.
- **The owner cannot edit special privileges after submission** (the FR-045
  edit path does not carry them yet); staff can see them but not edit them.
