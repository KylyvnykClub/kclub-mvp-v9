# 0042. Members bring people in through personal links, and the club records who brought whom

> **Status:** Accepted; §5 superseded for new applications by [0044](0044-business-application-consents-and-invite-trial.md)
> **Date:** 2026-10-05
> **Deciders:** Launch owner
> **Supersedes:** the "no attribution" parts of [ADR 0033](0033-standard-membership-is-paid.md) (per-person codes) and [ADR 0040](0040-partner-join-link.md) (decision 6)
> **Amends:** the positioning paragraph of [ADR 0009](0009-referral-data-minimisation.md)

## Context

Until now the club admitted people free only through two anonymous links held
by the owner (ADR 0033, ADR 0040). They credit nobody, and ADR 0033 refused
per-person codes in so many words, because "a code per member, a count, a
discount for bringing someone" is the step toward a referral programme.

The owner has decided to take that step. Every member — business partner, VIP
or club member — gets a section in their cabinet with personal links, the club
records who brought whom, and whether the newcomer pays depends on who brought
them:

|Inviter|Brings a business (partner link)|Brings a member (member link)|
|-|-|-|
|Business partner|free listing|free membership|
|VIP member|free listing|free membership|
|Club member|free listing|**paid**, still recorded|

Later everything may become paid. The matrix must be able to change without a
schema change.

## Decision

1. **Two personal links per member,** `partner` and `member`, in a new table
   `invite_links` (one active link of each kind per member, rotated by the
   member). The code is random and carries nothing about the member.
2. **Attribution is one level and frozen.** When a new account is created
   through a link, one `invitations` row records the invitee, the inviter, the
   link, the link's kind, the inviter's standing at that moment, and whether
   the matrix waived anything. The invitee is the primary key: one inviter per
   person, recorded once, never rewritten.
3. **A business partner, for the matrix, is one whose listing is paid with
   money** — a listing subscription or a captured hold. A partner whose
   listing was waived (by a link or by staff) counts as a club member: a free
   listing must not become a source of free memberships with no money anywhere
   in the chain ([ADR 0004](0004-stripe-billing-as-system-of-record.md)).
4. **The matrix is a pure domain function** (`inviteGrantsWaiver`) over the
   inviter's standing at the moment the newcomer registers, not when the link
   was made. An inviter who is not in the club — lapsed, blocked, erased —
   has an inert link: no attribution, ordinary paid flow.
5. **What a waiver does is what the existing links already do.** A waived
   member link makes the newcomer `sponsored` (ADR 0033). A waived partner link
   writes `listing_waived_at` on the first company that account files, with
   `listing_waiver_invite_link_id` beside it (ADR 0040, ADR 0041). One waiver
   per invitation, spent on the first application filed whether or not that
   one needed it. Every "waived counts as paid" rule applies unchanged.
6. **The inviter sees counts, never people.** The cabinet shows "you brought
   3 members and 1 business". Who they are is visible to staff only, on the
   member sheet. [ADR 0005](0005-no-member-directory.md) holds: no endpoint
   returns a collection of members to a member-scoped actor.
7. **Links only open the door for new accounts.** A signed-in visitor gets no
   cookie, and an existing member cannot be re-attributed.
8. **The inviter receives nothing.** No commission, no discount, no credit, no
   quota, no rank, no view of anyone further down. The only benefit is to the
   newcomer, and it is the same waiver the club already grants by hand.
9. The club's anonymous join link and partner link are unchanged and keep
   priority: a newcomer holding both is sponsored by the club's link.

## Rationale

The thing that makes a scheme MLM is a reward that flows up a chain: the
inviter earns from the people they bring and from the people those people
bring. Points 2, 6 and 8 hold that line in the schema rather than in good
intentions — there is one level, there is no column that could carry a reward,
and the inviter cannot see the people they brought, let alone their people.

Freezing the standing and the waiver on the invitation row means a later
change to the inviter (a lapsed VIP, a deleted account) never changes what the
newcomer was promised, and a later change to the matrix never rewrites
history.

Reusing `sponsored` and `listing_waived_at` rather than inventing a new
"invited" access state keeps one rule per question: the gate, the review queue,
publication and the partner's access read the same columns they read today.

## Alternatives considered

|Option|Why not|
|-|-|
|Keep only the owner's anonymous links and show them in the cabinet|Does not record who brought whom, which the owner asked for explicitly|
|Attribution columns on `members`|Mixes a fact about how someone arrived with the member's own record; a separate table has its own retention and is dropped as a whole if the programme ends|
|Show the inviter a list of the people they brought|A member-scoped endpoint returning members — exactly what ADR 0005 forbids|
|A VIP link|No row of the matrix makes VIP free, and a free VIP would be access without money behind it (ADR 0004). VIP is still bought in the cabinet|
|Evaluate the matrix when the link is created|A VIP who lapses would keep handing out free memberships|

## Consequences

**This makes easy:** asking where members come from, and changing who brings
people in free — one function, one test file.

**This makes hard:** saying the product has no referral mechanic. It now has a
one-level one, and the marketing and legal copy must describe it accurately.
Constraint 3 in CLAUDE.md is rewritten to the new boundary (points 2, 6 and 8).

**We accept** that a member can open a second account through their own link.
It earns them nothing the matrix would not give a stranger.

## Revisit if

- Anyone asks for a reward to the inviter, a ranking, or a view of the people
  they brought — each is the step this record stops short of
- Counsel advises that the programme needs disclosure in the Terms
- Everything becomes paid: change `inviteGrantsWaiver`, not the schema
