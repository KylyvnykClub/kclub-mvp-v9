# 0035. The landing page is the client's stylesheet, scoped to the landing page

> **Status:** Accepted
> **Date:** 2026-09-22
> **Deciders:** Client, Owner

## Context

The client commissioned a static prototype of the public home page — the
`Kylyvnyk-Landing` repository — and delivered it as approved: `index.html`,
`styles.css`, a `DESIGN_HANDOFF.md` and a `DESIGN_RULES.md` recording which
decisions are theirs to change and which are settled. The instruction that came
with it was that the home page should look like the prototype **one to one**, and
be functional.

The landing page this repository already had was built from two reference
mockups over several sessions, in Tailwind utilities, against the app's own
design tokens. It is not the delivered design and cannot be edited into it: the
prototype is a different typographic system (Prata and Geist, not Oxanium and
Manrope), a different palette, a different shell width, and a different set of
sections.

So there are two ways to render a delivered design: translate it, or run it.

Translating it means reading 753 lines of CSS and re-expressing every value as
Tailwind utilities. It is what the repository does everywhere else, and it has
one property that matters here: the result is no longer comparable to the file
the client approved. A reviewer asked "does this match?" has to diff a mockup
against a class list, and the answer drifts one utility at a time.

## Decision

**The prototype's `styles.css` ships as `src/app/kylyvnyk-landing.css`, ported
verbatim, with every selector scoped under a `.kyl` wrapper. The landing page's
markup mirrors the prototype's element for element. Everything behind the markup
is this application's.**

- The stylesheet is imported by `src/app/[locale]/page.tsx` and by nothing else,
  so it loads on one route. The `.kyl` prefix is not decoration: the prototype
  uses `.button`, `.section`, `.brand`, `.price`, `.country` and `.card-top`,
  and unscoped those would reach the catalogue, the dashboard and the console.
- **Five deviations, each marked in the file's header and at its site:** the
  light-theme token map is dropped (the landing is the dark page); asset paths
  move to `/brand/...`; the nine hand-drawn CSS flags become real flag files,
  because the flags now come from partner data; Lucide arrives as `lucide-react`
  rather than as tinted PNG files; and the scroll-reveal's hidden state sits
  behind `scripting: enabled`, so a page whose JavaScript never arrives is
  readable rather than blank. Two later fixes are recorded the same way: the
  footer baseline failed AA at 3.92:1 and moved one step lighter, and the search
  form was given a stacking context so its open filter list is not painted over
  by the cards below it.
- **The landing page keeps its own header and footer** (`KylHeader`,
  `KylFooter`). `SiteHeader` and `SiteFooter` still serve the catalogue, the
  dashboard, the pricing page and the console unchanged. The redesign was
  commissioned for the home page, and restyling the signed-in chrome with it is
  a separate decision nobody has made.
- **Nothing on the page is hard-coded content.** The figures under the hero are
  counted in the database, the three top cards are the partners staff curated,
  the directory section is the catalogue's own search behind the catalogue's own
  gate, and the prices come from `src/domain/pricing.ts`. A section with no data
  renders nothing rather than a placeholder.
- The superseded landing components are deleted rather than left beside the new
  ones. Two landing pages in one directory is how the wrong one gets edited.

## Rationale

The value of shipping the file is that the question "does this match the design"
has a mechanical answer for as long as the design is the source: `diff` the
stylesheet against the prototype's and read the marked deviations. That property
is worth more than consistency with the repository's styling convention, because
the convention exists to make our own decisions legible, and these are not our
decisions — they are the client's, already made.

Scoping is what makes it safe. The risk of a vendored stylesheet is that it
escapes; a prefix on every selector and a single import site is the answer, and
it is verifiable by reading the file.

The prototype's own boundaries said what it did not include: authentication,
payments, partner data, a backend. Those are exactly the parts this repository
already has, and the work is therefore joining the two rather than building
either. That division is why the markup is the prototype's and the data is ours,
rather than a redesign that is a little of both.

## Alternatives considered

|Option|Why not|
|-|-|
|Re-express the design in Tailwind utilities, as the rest of the app is written|Loses the property the decision is for: the delivered file stops being the reference the result can be checked against. It is also 753 lines of transcription, and every transcription error looks like a design choice|
|Ship the prototype as a static page outside Next.js and link to it|The page has to read the club's real figures, the curated partners and the catalogue, and it has to switch locale and know whether the reader is signed in. A static page does none of that, which is the part of the task that was actually asked for|
|Import the stylesheet globally rather than scoping it|`.button` and `.section` in a global sheet would restyle the console within the week, and the failure would be intermittent and hard to attribute|
|Adopt the prototype's chrome everywhere, replacing `SiteHeader`|A bigger change than the one requested, on screens the client has not reviewed, including every signed-in screen|

## Consequences

**This makes easy:** checking the page against the design, and taking the next
revision of it — a new `styles.css` is a port and a re-read of five marked
deviations, not a re-translation.

**This makes hard:** editing the landing with the rest of the app. A change to
the app's design tokens does not reach this page, and a change to this page does
not reach anything else. That is the trade, and it is stated here so that the
next person does not "fix" it by merging the two systems.

**We accept:** two header components and two footers, and a stylesheet in a
style the repository does not otherwise use. Both are visible, named and scoped
to one route.

## Revisit if

The client stops supplying design as code, or the landing's system becomes the
product's system — if Prata and Geist are adopted site-wide, this page should
stop being an island and start using the tokens like everything else.
