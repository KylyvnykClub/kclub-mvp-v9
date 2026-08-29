# 0024. Onboarding media is staged under the applicant's draft and promoted on submission

> **Status:** Accepted
> **Date:** 2026-08-29
> **Deciders:** Launch owner (via session)

## Context

[ADR 0023](0023-company-logo-upload.md) moved the logo onto the upload
pipeline but took it out of the registration form, on the grounds that
there is no company id to key an object on before the company exists. The
owner asked for the logo and gallery photos to be part of onboarding anyway
— a partner should finish the form with a complete listing, not come back
to a second screen for the pictures. The same request reshaped the form:
contacts and the discount moved up to step 1, which left step 3 free.

What made this tractable: a company draft is one row per member
(`company_drafts.owner_id` is unique, [ADR 0011](0011-company-drafts-in-their-own-table.md)),
lives 90 days, and is deleted on submission or discard. That is a stable,
already-swept identity to key staging on.

## Decision

Step 3 of the four-step form is **logo and photos**. Uploads there go
through the same decode → validate → re-encode pipeline as everything else
(ADR 0021–0023) into a staging prefix keyed by the applicant:
`media/drafts/{memberId}/logo.webp` and `media/drafts/{memberId}/{imageId}.webp`.
The draft row's data records what is staged (`logoStaged`,
`galleryImageIds`), so a resumed draft still shows its pictures, served to
the applicant only through `GET /api/draft-media/{slot}`.

On submission, after the company row exists, the staged objects are
**copied** to the company's keys (`media/companies/{companyId}/…`), rows are
inserted for the images that actually copied, `logoUrl` is set, and only
then is the staging prefix deleted. Promotion is best-effort: a failure logs
and leaves a company without its pictures, which the owner can add from My
Companies — the application is the point, a lost photo is not.

Discarding a draft and the 90-day draft sweep both delete the staging
prefix. The sweep collects the expiring owners before deleting the rows,
because afterwards the prefixes are no longer derivable — the same
collect-then-delete shape as member erasure (ADR 0022).

## Rationale

**Key by applicant, not by a new draft token.** One draft per member is an
invariant the schema already enforces; a token would be a second identity
for the same thing and one more field to keep consistent.

**Copy, then write rows, then delete the source.** The two stores do not
share a transaction, so the order is chosen so every failure leaves
something recoverable: a copy that fails leaves the source; rows are
written only for objects the copy confirmed; the source is deleted last. The
worst case is an orphaned staging object, which the 90-day sweep collects.

**The image id is chosen before the row exists.** Staging needs a name for
each photo, so ids are minted at upload (`randomUUID`) and the
`company_images` row is inserted with that same id on promotion — the row
id stays the object key (ADR 0022) without a rename step.

**Four steps stay four.** FR-040 says "four-step form" and the integration
suite is written against it; moving contacts up and putting media in the
vacated step keeps the requirement, the tests and the progress indicator
honest instead of renumbering all three.

## Alternatives considered

|Option|Why not|
|-|-|
|Create the company row at step 1 in a "draft" moderation status|Turns every abandoned form into a company row moderators and the catalogue must filter out; FR-042's invariant ("not visible before approval") would rest on a status check in every query instead of on rows not existing|
|Upload only after submission (ADR 0023's answer)|What the owner explicitly asked to change; a partner should not finish onboarding with a placeholder initial|
|Client-side previews only, no serve route|A refreshed or resumed draft would lose its previews while the objects sat in staging - misleading, and the applicant would re-upload duplicates|
|Move objects (copy + delete per object) rather than copy all then delete the prefix|Interleaving deletes with copies means a mid-way failure loses sources; copying everything first keeps the whole staging set until the rows exist|

## Consequences

**This makes easy:** a complete listing at the end of onboarding; the same
storage code paths for staged and live media; predictable cleanup through a
sweep that already existed.

**This makes hard:** reasoning about a half-promoted company — by design it
is "some pictures missing", never "broken references", but support has to
know that the fix is re-upload from My Companies, not a database repair.

**We accept:**

- **Retention:** staged media lives exactly as long as the draft — deleted
  on submission (after promotion), on discard, and by the 90-day sweep.
  [data-storage.md §4](../data-storage.md#4-retention-and-deletion) carries
  the row.
- Promotion is best-effort and unaudited; a logged error is the only trace.
  Acceptable because the failure is visible to the owner on their own card
  within seconds and reversible by them.
- A staging object whose id fell out of the draft data (a lost race between
  two tabs, say) is orphaned until the sweep. No reconciliation is built.

## Revisit if

- Promotion failures show up in logs at any rate that is not zero — that is
  the signal to move promotion into the outbox with retries.
- Drafts stop being one-per-member (multiple applications in flight), which
  breaks the keying assumption and needs a draft-scoped token.
