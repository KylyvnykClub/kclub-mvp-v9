# 0019. Take payment for a listing before moderation, not after

> **Status:** Accepted
> **Date:** 2026-08-26
> **Deciders:** Launch owner

## Context

[architecture.md §3.3](../architecture.md#33-partner-onboarding-to-publication)
stated the partner onboarding gates as "validity, human judgement, money", and
the code enforced it literally:
[`createCheckoutSessionAction`](../../src/actions/stripe.ts) resolved the company
through a `findApprovedCompanyByOwner` query, so a company whose
`moderation_status` was `pending` could not reach Stripe Checkout at all.

The consequence is a funnel with a multi-day hole in the middle. An applicant
completes a four-step form, is shown an inline confirmation, and is finished. The
Subscribe button appears only after a moderator acts — days later, on
Profile → Companies, a screen the applicant has no reason to revisit and no
notification pointing at. The moment of highest intent is the moment we ask for
nothing, and the moment we ask is the moment the applicant is gone.

Two facts shape the alternatives.

**The publication invariant is not the gate order.** [FR-044](../requirements.md)
requires that an approved company be published only once its listing subscription
is active, and that approval alone never publish it. That is a statement about
publication, evaluated at read time by ANDing `moderation_status = 'approved'`
with an access-granting subscription. It says nothing about which of the two
conditions is satisfied first. Reordering the gates leaves FR-044 and
[FR-042](../requirements.md) true word for word.

**Charging before judging creates an obligation that did not exist.** Under the
old order a rejected company had never paid, so rejection was free. Under the new
one a rejected company may have been charged for a listing that will never be
published. That is not a detail to leave to operational discipline.

## Decision

Submission hands straight off to listing checkout. A company that is `pending`
is eligible to pay; only a company that has already been rejected is refused.
**A rejection cancels the listing subscription and refunds the last invoice.**

## Rationale

Payment belongs where intent is, and intent peaks at the last field of the form.
Everything the old order protected is protected by something else: FR-042 keeps
the company invisible until approved, FR-044 keeps it unpublished until paid
_and_ approved, and both are enforced at read time rather than by sequence. What
the old order actually bought was the absence of refunds — which is a real thing
to give up, and is why the refund is part of this decision rather than a
follow-up.

Abandoning checkout is made harmless rather than prevented. The application row
is written on submission, so a closed tab costs the applicant nothing; the
company sits `pending` and unpaid and stays payable from Profile → Companies,
the path that existed before this change and still works.

The moderation queue is deliberately **not** filtered to paid companies. FR-042
requires a submitted company to enter the queue, and a filter would also hide
companies whose webhook has simply not landed yet — turning a timing gap into an
invisible application. Moderators get a paid/unpaid indicator and paid-first
ordering instead, which is triage rather than concealment.

## Alternatives considered

|Option|Why not|
|-|-|
|Keep moderation first, and chase the applicant with a payment reminder|Fixes nothing structurally: it adds a notification channel to a funnel whose problem is that the ask happens days after the intent. Worth doing anyway once the inbox exists, but as a reminder for abandoned checkouts, not as the primary flow|
|Charge only on approval, with card details captured up front|Stripe supports it (`setup_intent` then charge later), and it removes the refund obligation entirely. Rejected as materially more machinery — a second Stripe object, a deferred charge that can fail long after the card was collected, and a new failure mode where an approved company is un-chargeable — for a benefit the refund path already delivers|
|Free trial until the moderation outcome|Same shape as the above with worse economics and a trial-expiry edge case for every rejected application|
|Take payment first and simply not refund a rejection|Indefensible where the service was never rendered, and the kind of thing that turns into chargebacks and complaints rather than saved revenue. The owner rejected it explicitly|
|Filter unpaid companies out of the moderation queue|Contradicts FR-042, and hides applications whose payment is merely in flight. Triage, not concealment|

## Consequences

**This makes easy:** paying at the moment of intent, and telling the applicant
something true and specific on the way out — the application is under review, the
outcome arrives in the dashboard.

**This makes hard:** rejection. It is no longer a pure database write; it now has
an external side effect that can fail. The refund is therefore attempted _after_
the moderation decision, audit entry and notification have committed, and a
failure enqueues a retry rather than blocking the moderator. A staff decision must
never depend on Stripe being reachable.

**We accept:**

- A company can exist `pending` and unpaid indefinitely, if the applicant
  abandons checkout. It is invisible to members either way, and the retention
  sweep does not currently collect it.
- Moderators will see applications that have not paid, and must rely on the
  indicator rather than the queue's contents to prioritise.
- The refund path is only as idempotent as its guards make it. Rejection is
  therefore conditional on the current status inside the update, and the Stripe
  refund carries an idempotency key — a double-clicked reject must refund once.

## Revisit if

- Rejection rate rises to where refunds are a material share of processed volume.
  At that point capturing the card without charging (alternative 2) starts paying
  for its own complexity.
- Moderation latency drops to minutes rather than days. The funnel argument for
  this decision is entirely about the gap being long enough for an applicant to
  leave; if the gap closes, the old order costs nothing and avoids refunds.
- Chargebacks appear on rejected applications despite the automatic refund, which
  would mean the refund is landing too late to prevent the dispute.
