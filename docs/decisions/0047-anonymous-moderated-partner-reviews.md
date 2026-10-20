# 0047. Members review partners — anonymously, and only after a moderator reads it

> **Status:** Accepted
> **Date:** 2026-10-20
> **Deciders:** the club owner

## Context

Reviews and ratings were rejected when the product was scoped
([brief.md](../brief.md), [requirements.md §2](../requirements.md#2-scope)):
"Ratings invite exactly the gaming and retaliation dynamics the club exists to
avoid." On 2026-10-20 the owner asked for them anyway — a block of reviews and
a 1–5 star rating on every partner's page, with a form to leave one — as part
of the client's feedback round.

Two things constrain the answer. [ADR 0005](0005-no-member-directory.md): no
feature discloses one member's identity to another member, and a review signed
with a name, initials or a tier would be exactly that. And the original
objection still holds: an unmoderated rating is a lever for a competitor, a
grudge or a partner reviewing itself.

## Decision

**A member in the club may write one review of each published partner they do
not own: a rating from 1 to 5 and a text. It is published only after a staff
moderator approves it, and it is signed "Club member" — nobody but staff is
ever told who wrote it.**

- One review per member per company, enforced by a unique index. Writing again
  replaces the review and returns it to moderation; the member may delete it.
- "In the club" is the same rule every gate uses (`awaitsPaymentOutsideClub`):
  a member with unpaid dues may read reviews but not write one. A partner's
  owner can never review their own company.
- The public read selects the rating, the text and the date by name, never the
  member. The staff queue (`/dashboard/admin/reviews`) shows the author, so a
  moderator can spot a partner reviewing itself.
- The page's average and count are over approved reviews only.
- Retention: a review is deleted when its author is erased, when its company is
  deleted, and when the company's owner is erased
  ([data-storage.md §4](../data-storage.md#4-retention-and-deletion)).

## Rationale

Anonymity keeps ADR 0005 whole without inventing a pseudonym scheme. Moderation
before publication answers the gaming objection directly: nothing reaches a
partner's page that a person at the club has not read. One review per member
keeps a single person from outweighing everyone else.

## Alternatives considered

|Option|Why not|
|-|-|
|Signed reviews (name or initials)|Discloses a member to other members — breaks ADR 0005, one of the three constraints|
|Publish at once, staff hide afterwards|The damage of a retaliatory review is done in the hours before anyone looks; the club's promise is moderation|
|Stars without text|Gives a number nobody can moderate; the text is what tells a moderator whether a rating is honest|
|Keep rejecting reviews|The owner decided otherwise; the objection is met by moderation rather than by absence|

## Consequences

- `brief.md` and the out-of-scope table in `requirements.md` no longer list
  reviews as rejected; FR-127…FR-130 describe them.
- A new table, `company_reviews`, with a retention row and a deletion path.
- A new moderation queue in the console, with a sidebar badge. Every decision
  is audited (`review.approved`, `review.rejected`).
- A partner may ask who wrote a review. The answer is no, by design.
