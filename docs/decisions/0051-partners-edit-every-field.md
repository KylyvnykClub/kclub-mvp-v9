# 0051. A partner edits every field of their company; the offer waits for a moderator

> **Status:** Accepted
> **Date:** 2026-10-20
> **Deciders:** the club owner
> **Implements:** [requirements.md](../requirements.md) FR-045, widened from four fields to all of them

## Context

FR-045 always said a partner could edit their published listing, with the
approved version kept live until a moderator accepts the edit. The pieces
existed — `pending_changes` on the company, an approve/reject block in the
console — but the owner action took only four fields (name, categories,
description, discount) and nothing in the cabinet called it. The client
reported (feedback item 19) that a partner could not change anything at all,
and asked that every partner be able to edit every field.

## Decision

**In "My companies" a partner opens their company in the same form they
applied with, prefilled, and may change every field except the media (the
logo has its own control). On an approved company, contacts and the website
change at once; every other change waits in `pending_changes` and the live
listing stays as it was until a moderator approves it. A company still waiting
for its first review is edited in place.**

- The form posts the whole company each time, so what waits is exactly what
  still differs from the live listing: a later edit replaces an earlier one,
  and a field put back to its live value no longer waits.
- The edit is validated as an application is (the same schemas, categories
  checked against the prohibited list, the city against the country) and is
  looked up by owner, so another partner's company is never found.
- Every edit writes `company.owner_edited`, naming which fields applied and
  which wait. Approval and rejection are audited as before.
- The console shows each waiting field with the application form's label and
  its current and proposed values, categories by name.
- The slug never changes: a renamed partner keeps its address.

## Rationale

Moderation is what keeps the catalogue clean after approval — without it, an
approved listing could become a prohibited one in a single edit. Contacts are
the exception because a wrong phone number harms the partner and nobody else,
and fixing it should not wait for a moderator.

## Alternatives considered

|Option|Why not|
|-|-|
|Every edit live at once, audited|Lets an approved listing change its offer or category with no review|
|Contacts through moderation too|The owner chose otherwise: a contact fix should not wait|
|Edit forms per section|More screens to build and keep in step with the application form, for no gain|

## Consequences

- `PendingChanges` covers every owner-editable column plus the category and
  service-country lists; rows written before this used the same keys and still
  apply.
- A rejected or deleted company cannot be edited by its owner.
