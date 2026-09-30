# 0040. A second join link waives a partner's listing

> **Status:** Accepted
> **Date:** 2026-09-30
> **Deciders:** Launch owner
> **Extends:** [ADR 0033](0033-standard-membership-is-paid.md) (the member join link), [ADR 0037](0037-card-held-at-application.md) (the card hold)

## Context

ADR 0033 gave the owner one private link that admits a member without dues.
The owner asked for the same thing for businesses: a way to bring a partner
into the catalogue without payment, chosen in the console.

A partner's money is the listing, not the dues (ADR 0036). It is held on the
card at application and captured on approval (ADR 0037). A partner link must
therefore waive the listing, not the dues. It must also do so without
creating a path around moderation or around the "one rule for a paid listing"
that the catalogue, the partner page, the sitemap and the access gate share.

## Decision

1. `join_links` gains a `kind`: `member` or `partner`. The partial unique
   index becomes one active link **per kind**. Rotating or revoking one kind
   never touches the other. The console shows one card per kind.
2. Opening a partner link sets the same signed, short-lived cookie as the
   member link (the link's id, never its secret) and forwards to `/partner`.
   A member link forwards to `/register`, as before.
3. Registration sponsors a member only through a **member** link. A partner
   link never waives dues.
4. When an application is filed on `/partner`, the waiver is written onto the
   company (`listing_waived_at`, `listing_waiver_link_id`) in one `UPDATE`.
   That `UPDATE` requires the company to be pending and not yet waived, and
   the link to still be an active partner link. A link revoked a moment ago
   waives nothing. The cookie is spent either way, and the waiver is audited
   as `company.listing_waived`.
5. A waived listing stands in for payment everywhere payment is asked about:
   - it enters the review queue without a hold;
   - it can be approved without a hold (the approval precondition accepts
     "held or waived");
   - it counts as a paid listing for publication and for restoring;
   - it opens the club for its partner once approved.
     The partner's screen says "under review, the listing is free", and the
     approval notice and email say it is live with nothing charged. No hold
     checkout is offered.
6. No attribution. The link records no sharer and credits nobody, and a
   partner who came through it is indistinguishable from any other except
   for the waiver on the company. ADR 0009 holds: there is no referral
   mechanic here.

## Rationale

The waiver belongs on the company, not the account, because the listing is
the thing that is free. Putting it in the same SQL predicates that already
decide "held" and "paid" means there is still one rule for each question.
Checking the link inside the `UPDATE` is the same move as the approval and
restore guards: no read-then-write gap.

## Alternatives considered

- **A coupon on the Stripe price.** Rejected: it still asks for a card, and a
  $0 hold on a card is what the owner wanted to avoid.
- **Marking the partner account as waived.** Rejected: an account can own
  more listings than the one the link was meant for.
- **Skipping moderation for linked partners.** Rejected by the owner: the
  link removes the payment, not the review.

## Consequences

**This makes easy:** the owner hands one URL to a business and approves it
like any other; it goes live for free.

**We accept:**

- A waived listing is free for as long as the company is listed. Ending that
  means hiding or rejecting the company. Nothing expires on its own.
- Rolling the migration back deletes partner links and drops waivers. Waived
  companies then read as unpaid and leave the catalogue, which is the safe
  direction.

## Revisit if

- The owner wants a free period rather than a free listing. That is a Stripe
  trial on the listing price, not a waiver.
