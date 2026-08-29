# 0023. Company logos move onto the upload pipeline, superseding ADR 0013

> **Status:** Accepted
> **Date:** 2026-08-29
> **Deciders:** Launch owner (via session)

## Context

[ADR 0013](0013-partner-logos-as-external-urls.md) kept partner logos as a
member-supplied external URL, and gave one load-bearing reason: the upload
pipeline — R2 client, decode-as-validation, server-side re-encode, EXIF
stripping — was real, unbuilt infrastructure not worth building for a
theoretical risk. [ADR 0021](0021-member-avatar-upload.md) built exactly that
pipeline for avatars; [ADR 0022](0022-company-photo-gallery.md) reused it for
galleries. The logo was then the only image in the product still pasted as a
link, on a card that sat directly above a working "upload photo" control.
The owner, looking at a company whose logo slot showed the placeholder
initial, asked for the logo to be uploadable too.

## Decision

A company owner uploads the logo as a file from Profile › My Companies. It
goes through the same decode → validate → re-encode step as the avatar
(square, 512×512 WebP, EXIF stripped) into one slot per company at
`media/companies/{companyId}/logo.webp`, overwritten on each upload.

`companies.logoUrl` stays. On upload it is set to `/api/company-logo/{companyId}`;
on removal it is cleared. Every existing reader of that column — the partner
page, the catalogue card, the landing showcase, JSON-LD, the OpenGraph image —
renders the new value without change, and a row that still holds a
pre-change external URL keeps rendering that until its owner uploads a file.

The Logo URL field leaves the registration form. There is no company id to
key an object on before the company exists, and a URL field beside an upload
control would be the inconsistency this decision removes; the optional
schema field remains so saved drafts still validate.

## Rationale

**Serve without a session.** The gallery route (ADR 0022) requires a member
session because the catalogue is member-only. A logo is different: the
marketing landing's showcase shows partner logos to anonymous visitors, and
the partner page's OpenGraph card is fetched by crawlers with no cookie. So
`/api/company-logo/{companyId}` applies the publishable test alone — approved
AND an access-granting subscription (FR-044) — and lets the owner through
when a session identifies them, so they see the logo they just uploaded
before approval. Missing and not-visible are one 404.

**Keep the column, change its meaning.** Five readers and the JSON-LD
builder consume `logoUrl` as an opaque image URL. Storing the serve path in
it means zero reader changes and a gradual migration: old external URLs keep
working, new uploads replace them one company at a time, and the column can
be renamed to something honest in a later contract-phase migration if it
ever matters.

**One slot, not a gallery row.** A logo has no history and no ordering; the
avatar's overwrite-in-place shape (ADR 0021) fits and needs no sweep.

## Alternatives considered

|Option|Why not|
|-|-|
|Keep the URL field (leave ADR 0013 in force)|The only reason ADR 0013 gave no longer holds, and a partner now sees an upload control for photos beside a paste-a-link field for the logo|
|Store the logo as a `company_images` row with a `kind` column|Turns "which image is the logo" into a query-time rule over a gallery table, and forces the gallery's session-gated route to grow a public branch. Two shapes for two different things is simpler than one shape with a mode|
|Upload at registration, keyed by draft id, moved on submit|Correct in principle; a move step, a draft-scoped cleanup path and a second retention row for a field almost nobody fills at step 1. Uploading after creation covers the case with none of that|
|Rename `logoUrl` now|Every reader changes for no behavioural gain; expand-migrate-contract says do it when something else already forces a schema pass|

## Consequences

**This makes easy:** consistent image handling across avatar, gallery and
logo; logos on the public landing that were actually re-encoded by KCLUB
rather than hotlinked from wherever a partner pointed.

**This makes hard:** a `logoUrl` value now has two possible meanings —
serve path or legacy external URL — until the last legacy row is replaced.
Readers do not care, but a future audit of "which logos are hosted by us"
has to distinguish them by prefix.

**We accept:**

- **Retention:** the logo lives while the company does; the owner's erasure
  deletes it best-effort in the retention job alongside the avatar and
  gallery objects, from the owned-company ids collected before
  `eraseMemberTx`.
- The serve route returns `Cache-Control: private` even though the content
  is public once publishable, because the owner-before-approval branch makes
  the response caller-dependent. A CDN in front would need the owner branch
  split out first.
- ADR 0013's accepted risk — a partner swapping an approved logo without
  review — carries over unchanged, now with only re-encoded pixel data ever
  served.

## Revisit if

- A CDN or shared cache is put in front of media routes, which forces the
  owner-preview branch off this route.
- The last legacy external `logoUrl` is gone, at which point the column can
  be renamed honestly in the next schema pass.
