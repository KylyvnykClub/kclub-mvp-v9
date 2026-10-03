# 0041. Staff can waive a listing from the console

> **Status:** Accepted
> **Date:** 2026-10-03
> **Deciders:** Launch owner
> **Extends:** [ADR 0040](0040-partner-join-link.md) (the partner link waiver)

## Context

A partner paid, but not through the listing checkout, and the approved
company stayed out of the catalogue: the console shows it as unpaid and had
no way to publish it. Showcase placement saved, but a listing that is not
paid for is not shown anywhere, so the owner read it as a broken button. The
partner link (ADR 0040) waives a listing only when the application is filed
through it, never afterwards.

## Decision

1. A moderator can waive the listing of a pending or approved company from
   the company sheet, and withdraw the waiver again (FR-121).
2. It writes the same `listing_waived_at` the partner link writes, with no
   `listing_waiver_link_id`. Every rule that already treats a waived listing
   as paid - review queue, approval, publication, partner access - applies
   unchanged. There is still one rule per question.
3. Withdrawing clears the waiver whoever wrote it. Without money behind it the
   listing leaves the catalogue on the next read.
4. Both directions are audited (`company.listing_waived` with
   `{ by: "staff" }`, `company.listing_waiver_revoked`), in the same
   transaction as the write.

## Consequences

- Money and access can now be made to disagree on purpose, by a named staff
  member, with an audit entry. That is the point of a waiver; it is not a
  projection from client state.
- A partner who did pay must still be reconciled in Stripe (refund, or
  attach the payment to the listing). The waiver does not record money.
