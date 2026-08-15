# 0011. Keep company application drafts in their own table, not as companies with a `draft` status

> **Status:** Accepted
> **Date:** 2026-08-15
> **Deciders:** Tech lead

## Context

[FR-040](../requirements.md#4-functional-requirements) requires the company
application to be a four-step form that saves a draft between steps.
[ux.md §3.3](../ux.md#33-partner-applies-is-approved-pays-and-is-published)
adds that the applicant "always knows which of the four states they are in —
draft, in review, approved and unpaid, live", and
[architecture.md §3.3](../architecture.md#33-partner-onboarding-to-publication)
that "drafts are persisted per step so a lost connection does not cost the
applicant their work".

Two consequences follow from that wording. The draft is server-side —
`localStorage` cannot be a state the applicant is told they are in, and it does
not survive a change of device. And the draft exists before the applicant has
answered everything, by definition.

[glossary.md](../glossary.md) already listed `draft` among the internal company
statuses that precede publication, which reads as an instruction to store the
draft as a `companies` row.

## Decision

Company application drafts live in a separate `company_drafts` table — one row
per member, holding the partial answers as `jsonb` plus the furthest step
reached. `draft` is not a company moderation status; a `companies` row is
created only on submission, with `moderation_status = 'pending'`.

The glossary row is corrected in the same change.

## Rationale

`companies.name`, `companies.slug` and `companies.business_category_id` are
`NOT NULL`. A half-filled application has none of them. Storing drafts as
company rows therefore requires dropping those three constraints — for every
company in the table, including every published partner, permanently.

That is the whole of the argument. A transient state that lasts minutes would
buy its convenience by removing guarantees from the live catalogue, where they
are load-bearing: `slug` is the public URL, and a null category would silently
drop a partner out of every filter. Constraints that hold for one row in a
thousand are not constraints.

Three smaller consequences point the same way:

- **Moderation queries stay honest.** `listPendingCompanies` and the catalogue
  filters do not have to learn to exclude a status that must never be visible.
  A draft cannot leak into the catalogue by omission, because it is not in the
  table the catalogue reads. This matters more than it looks: FR-042 says a
  submission must not be visible to any member before approval, and the cheapest
  way to satisfy that is to make the unwanted rows unreachable rather than
  filtered.
- **Retention is separable.** A draft is abandoned work with a 90-day life
  ([data-storage.md §4](../data-storage.md#4-retention-and-deletion)); a company
  carries moderation history that outlives the company itself (FR-047). Putting
  both in one table means one sweep has to distinguish them by status forever.
- **The slug problem disappears.** Slugs are unique and derived from the name.
  A draft has no stable name, so it would need either a placeholder slug or a
  nullable unique column, both of which are worse than not having the row.

## Alternatives considered

**Draft as a `companies` row with relaxed constraints.** Closer to the glossary
as written, and it makes "my companies" a single query. Rejected for the reason
above: the cost is paid by the published data, permanently, and the benefit is a
join we can write once.

**`localStorage` only.** Cheapest, and it survives a refresh. Rejected because
it cannot survive a device change and cannot be a state the product reports back
to the applicant — both of which the UX text promises.

## Consequences

- "My companies" reads two tables and unions them; the draft entry is
  distinguishable and links back into the form at the saved step.
- One draft per member. A member wanting to apply with a second company
  finishes or discards the first. If that turns out to be wrong, the constraint
  is a unique index and dropping it is a one-line migration — which is the
  reversible half of this decision.
- The glossary keeps `draft` as a stage of the application, no longer as a value
  of `moderation_status`.
