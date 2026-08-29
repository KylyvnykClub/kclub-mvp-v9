# 0022. Companies get a KCLUB-hosted photo gallery through the avatar upload pipeline

> **Status:** Accepted
> **Date:** 2026-08-29
> **Deciders:** Launch owner (via session)

## Context

[ADR 0021](0021-member-avatar-upload.md) built the upload pipeline — S3-compatible
R2 client, decode-as-validation, server-side re-encode with EXIF stripping — for
member avatars, and its "Revisit if" named the company gallery as the next
consumer with a materially different shape: multiple images per company rather
than one slot per member. The owner asked for exactly that: a business profile
should carry a gallery. [ux.md](../ux.md) has described partner photography
"re-encoded on upload" since before any code existed; this is that, finally.

## Decision

A company owner can upload up to **10 photos** per company. Each goes through
the same decode → validate → re-encode pipeline as avatars, bounded to 1600px on
the longest side (aspect kept, never enlarged). Bytes live in R2 under
`media/companies/{companyId}/{imageId}.webp`; each photo is a row in
`company_images`, and the row id **is** the object key, so row deletion and
object deletion share one identifier.

Visibility follows FR-042/FR-044's read-time gates: the owner always sees their
own gallery (they manage it before approval, same eligibility shape as listing
checkout under ADR 0019); any other member sees an image only when its company
is approved **and** holds an access-granting subscription. `GET
/api/company-image/{imageId}` enforces this per image and answers the same 404
for "does not exist" and "not allowed to see".

## Rationale

**Row id as object key removes the orphan-sweep problem for a multi-image
shape.** ADR 0021 solved it by overwriting one slot; a gallery cannot, so
instead every object is reachable from a row, and the erasure job enumerates
rows to find every object it owes a DELETE. Upload writes the row first (an
orphaned object would be unreferenced; an orphaned row is just a broken image
the owner deletes); deletion removes the row first (the photo disappears
immediately; a failed object delete leaves unreferenced bytes, not a visible
image).

**No new moderation step.** Photos of a pending company are invisible to
members anyway (FR-042 gates reads), and photos added to an approved company go
live like a changed logo URL does under ADR 0013 — reviewable by staff on
report. FR-045's re-moderation list (name, category, description, discount) is
deliberately not extended; that would be a product decision with a queue cost,
taken when there is evidence of abuse rather than pre-emptively.

**No captions, no manual ordering.** Upload order is display order. Every field
is future PII/i18n/moderation surface; the gallery earns them when partners ask.

## Alternatives considered

|Option|Why not|
|-|-|
|External URLs, like the logo (extend ADR 0013)|The logo decision leaned on "one small image, moderated at approval". Ten arbitrary-sized hotlinked images per company is a different exposure, and the upload pipeline now exists — the reason ADR 0013 gave for not building it is gone|
|Require re-moderation when photos change|Defensible, but adds queue load for every photo swap with no observed abuse. The read-time gates already keep pending companies invisible; staff can act on report|
|Public/unauthenticated image serving|The catalogue itself is member-only; serving its images anonymously would leak partner content outside the club|
|One combined `media` table for avatars and gallery images|Avatars have no row at all (key = member id); forcing them into a table adds a migration and a join for symmetry nobody needs|

## Consequences

**This makes easy:** partner pages with real photography; staff seeing a
pending company's photos in situ; erasure enumerating exactly what to delete.

**This makes hard:** any future caption/ordering/moderation feature starts with
a schema change — accepted, per Rationale.

**We accept:**

- **Retention:** images live while the company does. `ON DELETE CASCADE`
  removes rows if a company row is ever deleted; member erasure deletes the
  rows explicitly inside `eraseMemberTx` (companies are anonymised, not
  deleted, so the cascade never fires — the notifications trap again) and the
  retention job deletes the R2 objects best-effort from refs collected before
  the transaction.
- An approved company's owner can swap gallery content without review, closed
  by staff report — the same accepted risk as ADR 0013's logo swap, now with
  the mitigation that only re-encoded pixel data is ever served.
- A failed object delete leaves unreferenced bytes in R2 until the erasure
  path or a manual cleanup touches them. No sweep is built for this.

## Revisit if

- A partner is caught swapping approved gallery photos for something
  inappropriate — the first incident argues for re-moderation on change, the
  pre-emptive version of which was rejected above.
- Partners ask for captions or ordering, which is the signal those fields earn
  their schema.
- Gallery bytes become a visible cost line, which argues for tighter caps or a
  colder storage class.
