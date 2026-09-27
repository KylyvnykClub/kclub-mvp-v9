# 0037. A partner's card is held at application, captured on approval

> **Status:** Accepted
> **Date:** 2026-09-26
> **Deciders:** Launch owner
> **Supersedes:** decision 4 of [ADR 0036](0036-payment-after-moderation.md), and the member-only contact details of [ADR 0034](0034-the-catalogue-is-public.md)
> ("nothing is charged before approval — the approval notice carries the link
> that pays")

## Context

ADR 0036 moved the listing payment behind moderation and, explicitly, declined
the alternative of taking the card up front and charging on approval: _"the
owner asked for the card not to be requested at all until the outcome is
known."_ Two days later the owner asked for exactly that alternative, as a
written specification:

> Registration → Hold $19.99 → Pending Review. APPROVE → automatic capture
> $19.99 → successful payment → receipt → Active → Publish. REJECT → cancel
> hold → money released → Rejected → NOT published.

with three constraints that are the substance of it: the administrator presses
**only** Approve and everything else happens by itself; a partner is **never**
activated or published by the button, only after Stripe's webhook confirms the
capture; and if the authorisation is no longer capturable, nothing is
activated. After the first payment the $19.99 recurs monthly by
`charge_automatically`.

The same message asked for three smaller things that are recorded here because
they changed decisions in force: logos shown whole, a "special privileges"
switch on the application, and a working one-page landing per partner with a QR
code that leads to it.

ADR 0036's own "revisit if" named the trigger — approved applications that are
never paid for. The owner has chosen to remove that risk rather than measure it.

## Decision

**The price is authorised on the card at application and captured on approval.**

1. **Hold.** After the application, the partner completes a Stripe Checkout
   session in `payment` mode whose PaymentIntent has `capture_method = manual`,
   `setup_future_usage = off_session` and `receipt_email` set to the partner's
   address. Card, Apple Pay and Google Pay are offered (`card` wallets in
   Checkout). The PaymentIntent waits in `requires_capture`; nothing is
   charged. Its amount is read from the listing plan's Stripe Price, so the hold
   and the subscription can never disagree.
2. **A projection, like subscriptions.** `listing_holds` holds one row per
   PaymentIntent, written only by the worker that handles
   `payment_intent.{amount_capturable_updated,succeeded,payment_failed,canceled,processing}`.
   The worker re-reads the PaymentIntent from the Stripe API (never the
   payload), orders deliveries by the event's `created`, and the webhook
   records each event id once.
3. **Approve asks Stripe to capture, and does nothing else.** It sets the
   moderation status and calls `paymentIntents.capture` with an idempotency key
   derived from the PaymentIntent. It publishes nothing and marks nothing paid.
4. **Publication waits for Stripe.** A captured hold counts as paying for the
   listing only once the projection of `payment_intent.succeeded` has written
   `captured_at` and `covers_until` (one calendar month later). "Paid" is now
   one rule — an access-granting listing subscription **or** a confirmed
   capture within its month — used by the catalogue, the partner page, the
   sitemap, the image routes, the admin badge and the partner's access to the
   club.
5. **Then the subscription.** The same projection starts the monthly listing
   subscription from the saved card: `collection_method =
charge_automatically`, `billing_cycle_anchor = covers_until`,
   `proration_behavior = none`, idempotency key per PaymentIntent. Stripe bills
   nothing until the paid month ends and an invoice, a charge and a receipt
   every month after. A failed renewal is the existing dunning path (FR-056).
6. **Reject cancels the authorisation.** Nothing is captured; the bank
   releases the amount. A hold that is authorised _after_ a rejection (a
   checkout left open in another tab) is cancelled as soon as Stripe reports
   it. A listing rejected after it went live has its first month refunded, as
   the subscription refund already did.
7. **An expired authorisation is never captured.** The capture deadline is read
   from the charge (`capture_before`); a hold past it, or no longer in
   `requires_capture`, is not captured, and the partner is asked for the card
   again. An approved partner whose authorisation lapsed pays through the same
   checkout, and it is captured as soon as Stripe reports it.
8. **One rule decides what to do with the money:** `planListingHoldSettlement`
   in `src/domain/listing-hold.ts`, pure, describing the end state for a given
   moderation status. The approve and reject buttons, the webhook worker and the
   outbox retry all run it, so running it twice asks Stripe for nothing new.

The smaller three:

9. **Logos are never cropped.** Uploads are bounded to 512 px on the longest
   side instead of cover-cropped to a square, and every surface contains them
   on a light plate. Logos uploaded before this change were cropped at upload
   and must be uploaded again; the originals were never kept.
10. **Special privileges** (FR-117) are a switch and an optional note on the
    company, public like the discount (ADR 0034).
11. **A partner's page is its landing, and it is public in full.** The page at
    `/{locale}/directory/{slug}` already existed; its cover and gallery photos
    answered 401 to a signed-out visitor, which is exactly who scans a QR code
    on a counter. Photos of a published company are now served to anyone, and
    so are the business's contact details - website, email, phone - which ADR
    0034 had kept behind sign-in: the owner's instruction was that the page
    show every field. The owner's own name (a member) and the referral action
    stay member-only (ADR 0005). The owner gets the page's QR
    code (FR-118), in the language of their choice, to download as a PNG. The
    slug is never rewritten, so a printed code keeps working.

## Rationale

**Checkout rather than a PaymentIntent confirmed on our own page.** Checkout
creates exactly the PaymentIntent the specification describes, keeps card entry
on a Stripe-hosted surface (FR-060) and gives Apple Pay and Google Pay without a
client-side Stripe library or a domain-verification file. The specification
names the PaymentIntent's parameters, and every one of them is set.

**A captured hold publishes, instead of waiting for the subscription.** The
alternative — publish only once the subscription created after the capture is
projected — adds a second Stripe call and a second webhook between the payment
and the listing, and a failure of that call would leave a partner who has paid
and is not live. The specification says the payment confirmation is what
activates the partner, and ADR 0004's rule is satisfied either way: the state
is projected from Stripe's own events, never from the button or the redirect.

**`billing_cycle_anchor` rather than a trial.** A trial would put the partner's
subscription in `trialing`, which is not an access-granting status, label a
paid month as a free one in the Customer Portal, and make every read of "is it
paid" special-case it. Anchored with no proration, the subscription is simply
active and next bills when the captured month ends.

**Cancelling in more places than the specification names.** Duplicate holds
(two tabs) and holds completed after a rejection would each keep a customer's
money reserved for a week for nothing. Cancelling them is the same guarantee the
specification asks for — money is only held for an application that can still
be approved — applied to the cases it did not list.

## Alternatives considered

|Option|Why not|
|-|-|
|Keep ADR 0036: charge by payment link after approval|Explicitly reversed by the owner; its known cost was approved applications never paid for|
|Charge at application, refund on rejection (ADR 0019)|A rejected business waits 5–10 days for its money; a cancelled authorisation is released by the bank without a refund appearing at all|
|Payment Element on our own page|Same PaymentIntent, plus a client library, Apple Pay domain verification and our own 3-D Secure handling, for no difference the partner would see|
|SetupIntent now, off-session PaymentIntent on approval|The first charge would be merchant-initiated and could need authentication the partner is not present for; an authorisation is what the owner asked for and is not subject to that|
|Publish on the approve click after a successful `capture()` response|Forbidden by the specification and by ADR 0004. The response is not the confirmation; the webhook is|

## Consequences

**This makes easy:** an administrator approves and the rest happens; a
rejected applicant never sees a charge or a refund; a paid partner is live
within seconds of Stripe's confirmation.

**This makes hard:** the authorisation window. Card networks release an
uncaptured authorisation after about seven days (fewer for some), and
moderation is 1–3 business days (FR-048) — there is headroom, not much. A
review that overruns asks the partner to reserve again.

**We accept:**

- The webhook endpoint in Stripe must be subscribed to the five
  `payment_intent.*` events above, or holds are never recorded and nothing is
  ever captured. This is an operations step, listed in operations.md.
- Stripe sends the payment receipt only in live mode, and the monthly invoice
  receipts only with "Email customers about successful payments" switched on in
  the Stripe dashboard.
- Uploaded logos that were cropped before this change stay cropped until the
  partner uploads them again.
- Gallery photos of published companies are public. A partner's photos are
  their advertising; ADR 0022's member-only gallery was a consequence of the
  catalogue being member-only, which ADR 0034 already ended for everything else.
- A club member who adds a company from the dashboard pays for it the same
  way: reserve, approval, capture, from Profile → Companies. The subscription
  checkout that opened after approval is removed, so there is one way a listing
  is paid for.
- A business's contact details are public on its page, for anyone who opens
  it - including scrapers. They are details the business gave for the
  catalogue; a partner who does not want one shown leaves it empty.

## Revisit if

- Authorisations lapse before review often enough to matter — more than a few
  percent of applications. Then either moderation gets faster or the hold is
  re-authorised automatically.
- Stripe changes authorisation windows for the networks we see most.
- A partner asks to see their first payment as an invoice rather than a receipt;
  the first month is a PaymentIntent, not an invoice line.
