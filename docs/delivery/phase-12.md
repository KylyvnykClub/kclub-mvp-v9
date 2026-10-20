# Phase 12 — Partner reviews

**Goal, from [requirements.md §6.1](../requirements.md#61-delivery-plan):** the
owner's decision of 2026-10-20 — every partner's page carries members' reviews
and star ratings, and a member in the club can leave one.

**Exit criterion, verbatim:** _A member in the club reviews a partner, a
moderator approves it, and the partner's page shows it signed "Club member"
with the average rating._

The decision is [ADR 0047](../decisions/0047-anonymous-moderated-partner-reviews.md).
It reverses the scoping-time rejection of reviews, on two conditions that keep
[ADR 0005](../decisions/0005-no-member-directory.md) whole: anonymity and
moderation before publication.

## 1. Tasks

|Task|Delivers|FR|Depends on|Est|Status|
|-|-|-|-|-|-|
|T-12.1|The record: ADR 0047, FR-127…FR-130, glossary rows in three languages, the retention row, the partner page in ux.md|—|—|0.25d|done 2026-10-20|
|T-12.2|Storage and rule: `company_reviews` and its migration, the pure eligibility rule, deletion on erasure and on company deletion|—|T-12.1|0.5d|done 2026-10-20 — `tests/partner-reviews.integration.test.ts`, `src/domain/reviews.test.ts`|
|T-12.3|The partner page: the reviews block, the star form, edit and delete|FR-127, FR-128, FR-130|T-12.2|0.5d|done 2026-10-20 — walked in a browser on a local build|
|T-12.4|The console: the moderation queue with approve and reject, audited, with a sidebar badge|FR-129|T-12.2|0.5d|done 2026-10-20 — walked in a browser on a local build|

## 2. What this phase must not do

- **No name on a review.** Not a display name, not initials, not a tier. The
  public read selects its columns by name and never the member.
- **Nothing published unread.** A new or edited review is `pending` until a
  moderator approves it.
- **No review of one's own company**, and none from a member outside the club.
