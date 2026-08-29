# 0013. Partner logos are member-supplied external URLs, not uploaded files

> **Status:** Superseded by [ADR 0023](0023-company-logo-upload.md) on 2026-08-29
> **Date:** 2026-08-19
> **Deciders:** Delivery lead
>
> **Superseded.** The reason given below for not building an upload pipeline
> — that it was real, unbuilt infrastructure — stopped being true once ADR 0021
> built it for avatars and ADR 0022 reused it for galleries. ADR 0023 moves the
> logo onto the same pipeline. The `companies.logoUrl` column survives, now
> holding the serve path of a KCLUB-hosted object rather than an external URL;
> rows from before the change still hold whatever URL the partner typed, and
> keep rendering until the owner uploads a file.

## Context

[security.md §1](../security.md) names "malicious file upload disguised as a
partner logo" as a threat and describes its mitigation: content-type and
magic-byte validation, server-side re-encoding, EXIF stripping, a separate
serving origin. [integration.md §2.4](../integration.md) and
[data-storage.md §2](../data-storage.md) document the supporting
infrastructure — a Cloudflare R2 bucket, an S3-compatible upload contract,
content-addressed keys, an orphan-object sweep.

None of that was ever built. `companies.logoUrl` (`src/data/schema/companies.ts`)
is a plain `varchar`, validated only as a well-formed URL
(`src/lib/company-form.ts`), and set directly from what the partner types into
`company-registration-form.tsx`. It is rendered with `next/image`'s
`unoptimized` flag, so the browser fetches it directly from wherever the
partner pointed it — the server never touches the bytes. This was discovered
while reconciling `docs/` against the shipped product for launch-readiness
tracking, not decided on at the time it shipped.

The gap this leaves: a partner can point `logoUrl` at any image after
moderation approves the listing, and swap it for something else afterwards.
Moderation reviews the URL at approval time, not the bytes behind it on every
subsequent page load.

## Decision

Partner logos and cover images stay a member-supplied external URL. R2 upload,
server-side re-encoding, and EXIF stripping are not built for this feature.

## Rationale

**It already ships and works for the current scale.** Fifty seed partners, no
reported abuse, and a moderation team of one to a handful of staff who can act
on a report quickly. Building the upload pipeline is real work — a content
type, an S3 client, a re-encode step, a cleanup sweep — for a risk that is
currently theoretical.

**The `unoptimized` flag already removes the sharpest edge.** Because
`next/image` does not proxy the URL server-side, a malicious URL cannot probe
internal infrastructure or make the server fetch something it shouldn't
(SSRF). The remaining exposure is client-side: whatever a visitor's browser
would render from any external image URL — the same exposure as any site with
an `<img src>` pointed off-domain, not a KCLUB-specific weakness.

**The stored-XSS and malware-distribution scenario `security.md` names does
not apply to hotlinking.** The original threat assumed the file was uploaded
to and served from our own storage, where a magic-byte mismatch or malformed
file could be served back with our origin's trust. An externally hosted image
carries none of that — the browser requests it directly from the partner's
host, under that host's `Content-Type`, not ours.

## Alternatives considered

|Option|Why not|
|-|-|
|Build the R2 pipeline now|The correct answer at scale. Rejected for now: no evidence of abuse, and the work is better spent on the items actually blocking launch|
|Restrict `logoUrl` to an allowlist of trusted image hosts|Doesn't fix the actual gap — moderation still can't see the bytes, and allowlisting a handful of hosts (Imgur, Google Drive, a partner's own site) is arbitrary and still lets a listed host serve something different tomorrow|
|Remove the logo field entirely|Removes a real piece of catalogue value (partners are visually recognisable) for a risk with no observed incidents|

## Consequences

**This makes easy:** shipping the catalogue without an upload subsystem, a
storage bucket, or a cleanup job to operate.

**This makes hard:** moderation cannot guarantee what a partner's logo shows
at any point after approval — only what it showed at review time. There is
also nothing to delete on member/company erasure
([data-storage.md §4](../data-storage.md#4-retention-and-deletion)): no
KCLUB-hosted image exists, so that step is now moot rather than outstanding.

**We accept:** a partner can swap the linked image after moderation approves
it, until a report catches it. `security.md`'s threat table is corrected to
describe this as the current, accepted shape rather than the original
upload-based mitigation.

## Revisit if

- A partner is caught swapping an approved logo for something inappropriate,
  malicious, or off-brand — the first real incident is the signal, not a
  calendar date
- The catalogue grows past the size where staff can act on a report within a
  day or two
- The club wants editorial control over image quality/cropping, which a
  server-side re-encode step would also buy
