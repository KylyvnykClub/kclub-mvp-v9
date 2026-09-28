# 0038. A partner's images are shown whole and fill their box

> **Status:** Accepted
> **Date:** 2026-09-28
> **Deciders:** Launch owner

## Context

ADR 0037 stopped cropping logos at upload and put them, contained, on a dark
plate on every surface. The owner looked at the result and asked for something
stricter on 2026-09-28: a logo or a banner is the company's face, it must never
be cut, **and** it must fill the whole box it is shown in - "as on other sites:
upload it and it looks right everywhere" - and it must be sharp. Partners will
upload whatever shape their logo or photo happens to be; the owner was willing
to ask them for specific sizes if that is what it takes.

Every surface has its own shape - a 2:1 catalogue card, a 140px landing panel, a
220px top-partner panel, a banner on the partner page, square owner previews -
so no single upload shape matches all of them. At the same time the partner
page's banner was carrying six things over the photograph (four badges, a logo
plate, the name), and the owner asked for all of it but the country flag to go.

## Decision

We will show every uploaded logo and photo whole (`object-fit: contain`) over a
blurred, cover-fitted copy of the same image that fills the rest of the box,
through one component, `FilledImage`; give the partner-page banner a 3:1 shape
from `sm` up with only the country flag on it; store logos up to 1024px and
photos up to 2560px on the long side; and tell the uploader, in the hint under
each field, the shape and resolution that fill a box edge to edge.

## Rationale

It is the only option that satisfies both halves of the instruction for every
image that is already stored and every one a partner will upload, without
asking the partner to do anything. A logo on a white background extends its own
white, a photograph extends its own colours, a transparent logo sits on a soft
glow of itself - the box is full and nothing is cut. Both layers use the same
URL, so the bytes are fetched once.

The resolutions are the largest size each surface draws the image, doubled for
a 2x screen: a catalogue card is about 420px wide, the banner up to 1280px.
The previous 512px logo and 1600px photo were upscaled on retina screens, which
is the blur the owner was seeing.

## Alternatives considered

|Option|Why not|
|-|-|
|`object-fit: cover` everywhere|Fills the box by cutting the image - the thing the owner forbade|
|Contained on a plate (ADR 0037)|Never cuts, but leaves bands of plate around any image whose shape differs from the box; the owner's complaint|
|A cropper at upload, one fixed shape per slot (as Facebook or LinkedIn do)|Needs a client-side cropper, a stored crop per surface or one shape forced on all of them, and does nothing for images already uploaded. Still a good follow-up: with a crop at upload the backdrop would simply never show|
|Box takes the image's own aspect ratio|Cards in a grid would have different heights; needs image dimensions stored with every upload|

## Consequences

**This makes easy:** any upload looks complete on every surface; one component
to change if the treatment changes.

**This makes hard:** styling the landing page, whose stylesheet has broad
`img` rules inside the art panels - they are overridden explicitly for
`.kc-fill` there.

**We accept:**

- An image smaller than its box is still upscaled by the browser; the upload
  hint asks for 1000px+ logos and 2400×800 banners, but nothing refuses a
  small file.
- Photos and logos stored before this change keep their old, smaller size until
  the partner uploads them again.
- Larger stored images: a 2560px WebP at quality 85 is several hundred KB.
- The partner's name is no longer printed on the banner; it stays the page's
  `h1`, visually hidden, and is printed on every card that links to the page.

## Revisit if

- Partners ask to choose the framing themselves - then add a cropper at upload
  with a 3:1 banner and a free-shape logo.
- Page weight on the catalogue shows up in the performance budget
  (requirements.md §5.1) - then serve a resized variant per surface.
