# 0050. The landing page follows the reader's light or dark choice

> **Status:** Accepted
> **Date:** 2026-10-20
> **Deciders:** the club owner
> **Amends:** [ADR 0035](0035-landing-page-is-the-clients-stylesheet.md) — "the light-theme token map is dropped"

## Context

Every page has a light/dark switch except the landing page, which ADR 0035
ported from the client's prototype as a dark-only page with its own header.
The owner asked for the switch back on the landing (client feedback item 24):
"each person chooses". The prototype itself shipped a light token map, with
the handoff note that it was optional "until every component has been
visually reviewed".

## Decision

**The landing header carries the same `ThemeToggle` as the rest of the site,
and the landing has a light theme: the prototype's own light token map, plus
fixes found by reviewing every section in light at desktop and phone width.**

- The map is scoped to `html.light .kyl`, next-themes' class, so the landing
  follows the same stored choice (or the system setting) as every other page.
- Gold text is darkened on light surfaces; the prototype's gold was chosen for
  a black page and is unreadable on cream.
- The floating header and its menus, the hero over its photograph, the business
  plan card, the footer and the image panels stay dark in both themes. They get
  the dark tokens back, so they look exactly as they do on the dark page.
- An open FAQ answer, the gold-edged secondary button and the catalogue's
  discount chip had fixed dark colours; they follow the theme.
- The dark theme is unchanged.

## Rationale

The owner's request, met with the client's own palette rather than a new one.
Keeping the photographic and card-like parts dark preserves the design where it
depends on a dark ground, and costs one token reset instead of re-colouring
each of them.

## Alternatives considered

|Option|Why not|
|-|-|
|A switch that only changes the rest of the site|The switch would appear to do nothing on the first page a visitor sees|
|A fully light page, hero and header included|The hero is a night photograph and the card faces are designed on black; both read worse on cream|

## Consequences

- A visitor whose system is set to light now sees the light landing on a first
  visit, as on every other page.
- The light fixes live at the bottom of `src/app/kylyvnyk-landing.css`. A new
  landing section needs a look in both themes.
