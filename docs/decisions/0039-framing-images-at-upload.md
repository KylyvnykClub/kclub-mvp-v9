# 0039. The owner frames a logo or photo before it is uploaded

> **Status:** Accepted
> **Date:** 2026-09-28
> **Deciders:** Launch owner

## Context

ADR 0038 made every image show whole and fill its box by laying it over a
blurred copy of itself. That works for any upload, but a photo whose shape
differs from its box still shows the blurred fill at its sides. It named the
follow-up: framing at upload, as Facebook and LinkedIn do. The owner asked for
it the same day.

## Decision

We will open a framing dialog whenever a logo or a photo is picked, in all three
places a company's media is uploaded (the partner application, the draft form,
Profile → Companies). The page banner - the first photo - is framed 3:1, later
photos 4:3, and a logo in a shape the owner chooses (as is, square, 2:1), starting
whole with transparent padding. The framed region is drawn to a canvas in the
browser and uploaded in place of the original, through the unchanged server
pipeline. "Use without framing" uploads the original.

## Rationale

The shapes are the shapes of the boxes: a banner framed 3:1 fills the 3:1
banner edge to edge, so the blurred fill of ADR 0038 never shows. Doing it in
the browser keeps the server exactly as it was - it still decodes, validates,
strips metadata and re-encodes whatever arrives, so a framed file has no path
around ADR 0022's checks. A logo starts whole because FR-118 promises a logo is
never cut by the platform; with framing, only its owner can cut it.

The geometry (`src/lib/image-crop.ts`) is pure and unit-tested: a photo always
covers its frame, a logo is never dragged out of it, the output is bounded to
the server's own limits and never enlarged.

## Alternatives considered

|Option|Why not|
|-|-|
|A cropper library (`react-easy-crop`, `react-image-crop`)|A new dependency on the upload path for about 300 lines of code we can test ourselves; neither lets a logo sit smaller than its frame with transparent padding without extra work|
|Crop on the server from coordinates sent with the original|Uploads the full original (often over the 5 MB cap from a phone) and adds an input to validate; the browser already has the pixels|
|Forcing a shape with no "use without framing"|Takes the choice from the owner; a logo that is already right should upload as it is|
|One frame for all photos|The gallery thumbnail is 4:3 and the banner 3:1; one of them would always show the fill|

## Consequences

**This makes easy:** banners that fill the page's top edge to edge; phone
photos over 5 MB now upload, because the framed copy is at most 2560px.

**This makes hard:** changing a box's shape on the site now also means changing
its frame (`BANNER_ASPECT`, `PHOTO_ASPECT`), or new uploads stop matching.

**We accept:**

- An animated GIF becomes a still image once framed; "use without framing"
  keeps it as uploaded (the server already keeps only the first frame).
- If the owner deletes the banner, the next photo - framed 4:3 - becomes the
  banner and shows ADR 0038's blurred fill at its sides until they upload a
  new one.
- A file the browser cannot decode (HEIC in most browsers) cannot be framed;
  the dialog says so and offers to upload it as it is, where the server
  decides.

## Revisit if

- Owners ask to re-frame an image already uploaded - that needs the original
  kept, which ADR 0022 chose not to do.
- A box on the site changes shape.
