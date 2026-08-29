# 0025. The onboarding city picker reads city names from the CountryStateCity API

> **Status:** Accepted
> **Date:** 2026-08-29
> **Deciders:** Launch owner (via session)

## Context

The company form asked for "administrative level 1", "administrative level
2" and "city" as three free-text fields, and [data-storage.md §3](../data-storage.md#3-schema-and-migrations)
planned for cities to come from a seeded reference table maintained by
staff (FR-085). The seeded `cities` table exists and is effectively empty —
there is no curated city list per country and nobody to curate one — so
FR-041's "city belongs to the selected country" check passes anything it
has never heard of, which is nearly everything.

The owner asked for the city to follow the country as a picker that fills
itself from the country, and supplied a CountryStateCity API key for it.

## Decision

Country of registration → city, picked from the CountryStateCity list for
that country, with type-ahead over the list in the browser. The list is
fetched by a Server Action (`listCitiesForCountryAction`) that sends the key
in a request header and caches one country's names in process memory for a
day; the key never reaches a browser. The two administrative-level fields
leave the form (the columns stay, nullable, for existing rows).

Any failure — no key configured, provider down, timeout — returns null and
the field becomes plain text. FR-041's server-side check runs in both cases.

## Rationale

**A Server Action, not a browser call.** The provider authenticates with a
static key in a header. Shipped to the browser it is public within a day;
behind an authenticated action it is a secret like any other in
[security.md §4](../security.md#4-secrets-management).

**Whole-country lists, filtered client-side, not a search endpoint per
keystroke.** A country's cities are at most a few hundred kilobytes and the
list is reference data; one fetch per country per day per process is
cheaper for us and for the provider than a request per keystroke, and the
type-ahead stays instant.

**Optional by construction.** The product must not have a hard runtime
dependency on a free-tier reference-data API. Null → free text means CI, a
fresh clone and a provider outage all still produce a valid submission.

**Not the seeded `cities` table.** Curating cities for every country the
club operates in is work nobody has scheduled; the table stays as the seat
of FR-085's staff-managed overrides and FR-041's blocklist-style checks,
while the picker's suggestions come from the provider.

## Alternatives considered

|Option|Why not|
|-|-|
|Seed the `cities` table from the provider's dataset once|A one-off import of ~150k rows to maintain forever, for data the provider already maintains. Reasonable later if the dependency proves flaky|
|Country → region → city, using the provider's states endpoint|Keeps lists small for the largest countries, but adds a step the owner asked not to have; whole-country lists are acceptable at the sizes involved|
|Call the provider from the browser|Leaks the key|
|Keep three free-text fields|The status quo the owner asked to replace; FR-041 gains nothing from data it cannot check|

## Consequences

**This makes easy:** consistent city spelling within a country, which is
what the catalogue's location filter groups by.

**This makes hard:** nothing new — the fallback is exactly the old field.

**We accept:**

- A new external vendor with no published SLA, listed in
  [integration.md §1](../integration.md#1-external-dependencies) as
  non-critical and degrading to free text. It receives an ISO country code
  and nothing else; no personal data leaves the system for it.
- A free-tier quota. The per-process daily cache keeps a serverless
  deployment well inside it; if the quota is ever hit, the field degrades,
  it does not break.
- The key rotates with the other vendor credentials on the 90-day
  schedule in [security.md §3](../security.md#3-data-protection).

## Revisit if

- The provider's data quality or availability becomes a support topic —
  the one-off import above is the fallback.
- The club wants staff-curated city lists after all (FR-085), at which
  point the table and the provider need a precedence rule.
