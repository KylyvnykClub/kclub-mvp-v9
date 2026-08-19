# 0014. No dedicated notification log table

> **Status:** Accepted
> **Date:** 2026-08-19
> **Deciders:** Delivery lead

## Context

[data-storage.md](../data-storage.md) documents a `notification_log` table
(recipient, template, language, outcome — never the body) with a 12-month
retention period, a place in the entity-relationship diagram, a partitioning
plan once it exceeds 5 million rows, and a step in the member-erasure
procedure that clears a member's entries from it. No FR requires it —
[FR-095](../requirements.md#4-functional-requirements) requires that
transactional notifications are _delivered_ by email or SMS in the member's
language; it says nothing about logging the send.

No such table exists in `src/data/schema`. `src/modules/notifications/email.ts`
sends through Resend with zero persistence anywhere. This was found while
reconciling `docs/` against the shipped schema for launch-readiness tracking —
it was designed but never built, and nothing currently depends on it existing.

## Decision

KCLUB does not build a dedicated `notification_log` table. Deliverability
debugging relies on Resend's own dashboard and delivery/bounce webhooks
instead of a first-party log.

## Rationale

**Nothing requires it.** No FR asks for a queryable history of sends; the
retention row existed because a "what did we send" audit trail is generally
good practice, not because the product needs one. Building a table, a write
path from every notification call site, a partitioning plan, and an erasure
step for a capability nothing currently consumes is speculative work.

**Resend already provides the thing the table was for.** Deliverability
debugging — did this land, did it bounce, was it opened — is exactly what an
email vendor's dashboard is built to answer, and it answers it without KCLUB
storing a second copy of who received what.

**It simplifies member erasure.** `data-storage.md §4`'s procedure had a step
to clear a member's notification-log entries; with no such table, that step
is moot rather than outstanding, closing part of the gap tracked against
FR-009.

## Alternatives considered

|Option|Why not|
|-|-|
|Build the table as originally planned|Real work — schema, write path at every send call site, partitioning, an erasure step — for a debugging capability Resend already provides|
|Log to Axiom instead of a table|Closer to what's needed, but still unbuilt, and application logs already carry `member_id` there (`data-storage.md §4`) without a new subsystem|

## Consequences

**This makes easy:** notification sending stays a single call into Resend
with no write-path or retention obligation to maintain.

**This makes hard:** answering "did we send this specific notification" from
our own data requires going to the Resend dashboard instead of querying our
database — an operational, not a product, cost.

**We accept:** losing first-party notification history if Resend access is
ever lost or the vendor is switched without a migration plan for that
history.

## Revisit if

- A staff or compliance need appears for notification history the Resend
  dashboard cannot answer (e.g., cross-referencing sends against member
  status changes)
- KCLUB moves off Resend and the replacement vendor's dashboard is
  insufficient
