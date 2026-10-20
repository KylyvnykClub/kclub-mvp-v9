# 0049. The partner photo gallery is withdrawn; the logo is the page banner

> **Status:** Accepted
> **Date:** 2026-10-20
> **Deciders:** the club owner

## Context

[ADR 0022](0022-company-photo-gallery.md) gave every company a gallery of up to
ten photos, and [ADR 0038](0038-partner-images-whole-and-filling.md) made the
first of them the banner across the top of the partner's page. On 2026-10-20
the owner asked for the gallery to go from the cabinet and from registration:
it is one more thing to fill in, and an empty or weak gallery made a page look
worse than none.

## Decision

**Partners no longer upload photos — not in the cabinet, not on the partner
application, not in the dashboard registration form — and the partner page no
longer shows a gallery. The banner at the top of the page is the logo, shown
whole on a blurred copy of itself, the way the catalogue card already shows
it.**

- Photos already uploaded are **kept**, in `company_images` and R2, and simply
  not shown. Bringing the gallery back is then an interface change only.
- The upload actions and routes stay in place, unused by the interface, for the
  same reason. Their retention and deletion paths (ADR 0022, data-storage.md
  §4) are unchanged, so an erased owner's photos still go.

## Rationale

The owner's call, on presentation grounds. Keeping the files rather than
deleting them makes the decision cheap to reverse and costs nothing: no new
photo can arrive, and the existing ones keep their deletion path.

## Alternatives considered

|Option|Why not|
|-|-|
|Delete existing photos|Irreversible, and nothing is gained while they are not shown|
|Hide only the upload, keep showing existing galleries|Partners would see photos on their page they can no longer change or remove|
|Keep the first photo as the banner|Same problem: a banner nobody can replace|

## Consequences

- FR-120's framing applies to the logo only in practice; the banner and
  gallery shapes are no longer offered.
- The page banner is the logo (glossary "Page banner").
- The stored photos are personal-data-adjacent files with no use; if the
  gallery is not brought back, a later change should delete them and the
  upload code together.
