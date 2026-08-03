# 0004. Make Stripe the system of record for subscriptions and project entitlements from webhooks

> **Status:** Accepted
> **Date:** 2026-08-02
> **Deciders:** Tech lead, client

## Context

Two products are sold at $19.99/month: VIP membership and a partner listing.
Both are recurring, both must survive cancellation gracefully (access until the
end of the paid period), both must handle failed payments with a grace period,
and one of them controls whether a paying partner's listing is visible at all.

The client's stated non-functional requirement was blunt: no double charges, and
nobody who has paid may be without access. Those are the two failure modes that
destroy trust irrecoverably in a paid club.

The tempting design is to treat the browser's return from checkout as the
signal — the user comes back to `/success`, so grant the entitlement. It is
simple, it demos well, and it is wrong: a redirect proves only that a browser
followed a link.

## Decision

Stripe Billing is the system of record for subscriptions, invoices and payments.
The product's own **entitlements** are a local projection, computed only from
Stripe webhook events, verified by re-fetching the subscription from Stripe's
API, and reconciled against Stripe nightly. A return from the Stripe redirect
never grants access.

## Rationale

Being the record of what someone was charged is a liability with no upside: it
means reimplementing proration, tax, dunning, retries, disputes and receipts, and
being wrong about them in public. Stripe already is that record, and its data
survives our database being lost entirely — which is why the RPO for
subscriptions is zero while everything else's is five minutes.

Entitlements, by contrast, are ours. "What does an active VIP subscription
unlock in this product" is a domain rule that must be answerable in a few
milliseconds on every page render, without a network call to a third party. So
the boundary is: Stripe owns _what was paid_, we own _what that means here_.

Three implementation rules follow, and they are the substance of the decision:

**Idempotency is enforced by the database, not by code.** `stripe_event.id` is a
primary key. A duplicate delivery collides on insert and the handler returns 200
having done nothing. No developer has to remember.

**Projection is a fold over state, not a sequence of deltas.** Given the current
subscription object, compute what the entitlement should be and write that.
Stripe does not guarantee event ordering, and a system built on deltas is
therefore built on an assumption Stripe explicitly declines to make. A
`stripe_updated_at` watermark discards anything older than what has been
applied.

**The webhook endpoint does the minimum.** Verify the signature, insert the
event, write an outbox row, return 200. Projection happens in a worker. A
handler that does real work eventually becomes slow, a slow handler makes Stripe
retry, and retries against a half-finished handler are how double-provisioning
happens.

Stripe was chosen over a merchant-of-record alternative deliberately, with the
client accepting the tax obligation in exchange for the subscription API's
control and — decisively — **test clocks**, which let the whole lifecycle
(subscribe, renew, fail, dun, recover, cancel, lapse) run in CI against Stripe's
own environment rather than against a mock of our beliefs about Stripe.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Grant access on the checkout redirect | A redirect is not a payment. Loses money to anyone who visits the success URL directly; also fails honestly when the user closes the tab after paying |
| Trust webhook payload fields without re-fetching | Cheaper, and mostly fine. Rejected because anything granting access should depend on Stripe's current view, not on a message we received — the difference matters exactly when something has gone wrong |
| Poll Stripe on every request instead of projecting | Correct but slow, and makes every page render depend on a third party's uptime. Would put a 200 ms external call on the critical path of the catalogue |
| Keep subscriptions only in Stripe, no local copy | Every page needs to know the viewer's tier. Also makes the staff console's finance screens impossible without paging the Stripe API live |
| Paddle or Lemon Squeezy (merchant of record) | Would remove the global VAT/sales-tax burden entirely — a real benefit for an international club. Rejected because fees are roughly 2 points higher, the subscription API is materially weaker, and there is no test-clock equivalent, so the lifecycle could not be verified in CI. Revisit below |
| Build our own recurring-billing engine on card tokens | Nobody sensible does this. Would raise us from PCI SAQ-A to a far larger compliance burden |

## Consequences

**This makes easy:** correct billing lifecycle without writing one; PCI SAQ-A
compliance by construction, since no card data touches our servers; a
subscription RPO of zero; testing months of billing in seconds; recovering our
own state from Stripe after any local data loss.

**This makes hard:** entitlements are eventually consistent — a member who has
just paid may see "activating" for a few seconds; the staff console cannot edit
a subscription directly, only through Stripe; and the client carries the
sales-tax and VAT registration burden as the merchant of record.

**We accept:** total dependence on Stripe for revenue, with no realistic
alternative provider; a few seconds of visible lag after payment; and the
operational obligation of the nightly reconciliation job — a divergence it
repairs is a defect, and it alerts rather than silently fixing.

## Revisit if

- Sales-tax or VAT registration is required in more than roughly five
  jurisdictions, at which point a merchant of record may be cheaper than an
  accountant, and the payment layer's abstraction is what would make the move
  possible
- Stripe becomes unavailable in a market the club wants to enter
- Entitlement lag becomes user-visible in a way that generates support volume,
  which would argue for an optimistic local grant with reconciliation — a
  meaningfully riskier design that we are not taking now
- A second paid product appears whose lifecycle Stripe Billing models badly
  (usage-based, seat-based, or one-off with entitlement)
