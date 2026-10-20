# 0048. A VIP join link: free membership with a VIP card from the start

> **Status:** Accepted
> **Date:** 2026-10-20
> **Deciders:** the club owner

## Context

The owner admits some people as free VIP members. Until now that took two
steps: send them the member join link ([ADR 0033](0033-standard-membership-is-paid.md)),
which makes a sponsored member with a free card, then open the member in the
console and reissue the card as VIP by hand. The owner asked for one link that
does both.

## Decision

**We add a third join link kind, `vip`. Registering through it creates a
sponsored member whose first card is VIP — the same result as the member link
followed by a manual VIP reissue, in one step.**

- One live VIP link at a time, read, rotated and revoked by `staff_owner` on
  the same console screen as the other two, each change audited (FR-106).
- It is proved the same way as the member link: a signed cookie set by
  `/join/<secret>`, the link re-read at submit time, so revoking takes effect
  at once.
- What a link grants is one pure rule, `joinLinkGrant` (`src/domain/join-link.ts`).
- A partner registration through the VIP link gains nothing from it.

## Rationale

It grants nothing the owner could not already grant by hand, and it keeps the
grant in the place that already proves the door: the join-link cookie. A
separate "make VIP" step that the owner can forget is replaced by a link that
cannot be half-applied.

## Alternatives considered

|Option|Why not|
|-|-|
|A VIP flag on the member link|One link would then mean two things; rotating it to stop VIP would also stop free membership|
|A free VIP subscription in Stripe|Access is projected from Stripe (ADR 0004), so a 100%-off VIP price would work, but it is a billing object for something that costs nothing, and the manual path the owner already uses does not create one|
|Keep the manual reissue|The owner asked for it to go away|

## Consequences

- `join_link_kind` gains `vip`. The down migration rebuilds the type without
  it and deletes VIP link rows; members already admitted keep their sponsored
  dues and VIP card.
- A VIP-link member holds a VIP card and pays nothing, exactly like one
  upgraded by hand. What a VIP _subscription_ unlocks — client referrals
  (FR-070), which also need a published company — still needs that
  subscription; this link does not create one.
- Like the other join links it records no attribution and rewards nobody for
  sharing it. It is a club door, not a member's invite link (ADR 0042).
