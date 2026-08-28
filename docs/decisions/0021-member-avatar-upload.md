# 0021. Member avatars are uploaded through a server-side re-encode pipeline into R2

> **Status:** Accepted
> **Date:** 2026-08-28
> **Deciders:** Launch owner (via session)

## Context

`profiles.avatarUrl` (`src/data/schema/profiles.ts`) shipped the same way
`companies.logoUrl` did: a plain member-supplied URL, no upload, no
validation beyond "is this a well-formed URL". [ADR 0013](0013-partner-logos-as-external-urls.md)
made that shape an explicit, reasoned choice for partner logos — public
listings, moderated before anyone sees them, cheap to keep external at the
scale the club launches at.

A member avatar is a different object. It is not moderated, it is not
public (nothing in the product currently renders another member's avatar to
anyone — [ADR 0005](0005-no-member-directory.md) means it should stay that
way unless a future feature explicitly decides otherwise), and the member
supplying it is not a business being vetted, they're a private individual
uploading a photo of themselves. Pointing that field at an arbitrary
external URL forever is not the same trade ADR 0013 made; it is closer to
what [ux.md](../ux.md) originally described — "photography ... re-encoded on
upload" — and never built.

Neither R2 as an application-facing object store, nor an upload pipeline of
any kind, exists anywhere in this codebase before this change. R2 today
holds only the nightly PostgreSQL backup dump ([data-storage.md §2](../data-storage.md#2-storage-choices)).

## Decision

A member can upload an avatar image. The server decodes it, validates the
result is actually a JPEG/PNG/WebP/GIF (not merely a file claiming to be
one), re-encodes it to a fixed-size WebP — which also strips all EXIF/
metadata as a side effect of the round trip — and stores it in the same R2
bucket already used for backups, under a `media/avatars/` prefix. The
bucket's `backups/` prefix keeps its existing (private) access; only
`media/` is served publicly through the app.

One object per member (`media/avatars/{memberId}.webp`), overwritten on
every upload. Served through `GET /api/avatar`, authenticated, always the
caller's own avatar — the route does not accept a target member id, so
there is no object-level authorization surface to get wrong for a feature
nothing currently needs.

## Rationale

**Decode-as-validation is the strongest form of content-type checking
available.** A browser's reported `Content-Type` is metadata the uploader
controls; a file that fails to decode as an image is not one, regardless of
what it claims to be. `sharp` was already a transitive dependency (Next's
own image optimizer) and is now a direct one.

**A single overwritten slot needs no cleanup job.** ADR 0013 named an
orphan-object sweep as real, unbuilt infrastructure. Keying the object by
member id rather than by upload makes every new PUT also the deletion of
whatever was there before, and account deletion is exactly one `DELETE`
against the same key — no sweep, no versioning, no accumulation.

**Reusing the backup bucket under a new prefix, not a new bucket.** Nothing
about serving avatars needs isolation from the backup dump beyond an access
policy — the same account, one bucket, two prefixes with different public/
private treatment, is less to provision and operate than a second bucket
with its own credentials.

**The route takes no member id.** Nothing in the product renders one
member's avatar to another today. Adding an object-level ownership check
for a case that cannot happen would be authorization surface with nothing
to protect and no test to prove it stays correct. If a future feature needs
to show avatars across members, that is a new decision — evaluated with
whatever that feature actually requires — not a quiet extension of this
route.

## Alternatives considered

|Option|Why not|
|-|-|
|Keep the URL field, same as `companies.logoUrl`|Correct call for a moderated public listing; wrong for a private, unmoderated, personal photo — see Context|
|Presigned direct-to-R2 upload from the browser|Removes the server from the path entirely, which also removes the only place validation and re-encoding can happen. ADR 0013's original threat mitigation (content-type/magic-byte validation, server-side re-encode, EXIF strip) is only possible if the bytes pass through our server first|
|A dedicated R2 bucket for member media|Cleaner isolation from backups, but two buckets means two credential sets to provision and rotate for a distinction a prefix and an access policy already cover|
|Versioned objects with an orphan sweep (matching what ADR 0013 originally scoped for partner logos)|A member avatar has no reason to keep history — one photo, replaced by the next one. Versioning would be building the exact unbuilt-infrastructure problem ADR 0013 named, for a feature that doesn't need it|

## Consequences

**This makes easy:** validating and normalising what an avatar actually
contains before it's stored; deleting it on account deletion with no sweep
or reconciliation job; adding a company image gallery next on the same
`src/modules/platform/object-storage.ts` seam without re-deciding any of
this.

**This makes hard:** nothing currently, because nothing else reads this
object. The first feature that wants to show an avatar to someone other
than its owner has to design that access check from scratch — deliberately,
per the Rationale above.

**We accept:**

- **Retention and deletion.** The avatar exists for as long as the member's
  account does, on the same 30-day clock as the rest of it
  ([data-storage.md §4](../data-storage.md#4-retention-and-deletion)).
  Requesting deletion (`requestAccountDeletionAction`) does not touch the
  R2 object — it only starts the clock, same as it does for everything
  else. The actual erasure job (`src/app/api/cron/retention/route.ts`, at
  day 30) deletes it best-effort, alongside the Stripe Customer deletion it
  already performs: an unreachable R2 must not block the rest of that
  member's erasure, and the worst case of a failed delete is one orphaned
  object under a member id nothing references anymore, not a retry-worthy
  loss.
- **Cache correctness relies on `/api/avatar` being cheap to fetch, not on
  it being cacheable across members.** The route is authenticated and
  returns `Cache-Control: private`, so nothing but the requesting member's
  own browser should ever hold a copy — there is no CDN or shared cache in
  front of it today.
- **This narrows ADR 0013's scope, it does not reverse it.** `companies.logoUrl`
  is untouched and stays a member-supplied external URL under ADR 0013's
  original reasoning.

## Revisit if

- A company photo gallery ships (already the next piece of work) and needs
  its own retention/moderation answer — multiple images per company is a
  materially different shape than one slot per member.
- A feature wants to show a member's avatar to someone else. `/api/avatar`'s
  contract (always-caller's-own, no target id) has to be redesigned
  deliberately at that point, with the object-level authorization ADR 0005
  requires for it.
- R2 costs or Cloudflare account structure change in a way that makes a
  dedicated media bucket cheaper than a shared one with prefixes.
