# 0006. Use PostgreSQL full-text search for the catalogue, with no separate search engine

> **Status:** Accepted
> **Date:** 2026-08-02
> **Deciders:** Tech lead, backend engineer

## Context

Members search the partner catalogue by name and description, and filter by
category, country and city. Content exists in English, Russian and Ukrainian —
partners supply English as a required field and the other two optionally. The
performance budget is 400 ms at p95 for a combined filter-and-search query.

The catalogue is small and will stay small: 50 published companies at launch,
2,000 after a year, and 15,000 at the three-year design ceiling in
[requirements.md §5.3](../requirements.md#53-scalability). Every partner is
manually moderated, which caps growth at human throughput — roughly 50 items per
day per moderator.

The reflex is to add Elasticsearch, Algolia or Typesense. Each brings typo
tolerance, synonyms and better multilingual ranking, and each brings a second
datastore to secure, monitor, back up, keep in sync and reason about at 3 a.m.

## Decision

Catalogue search will be PostgreSQL full-text search: a `tsvector` column on
`company`, maintained by a trigger, weighted (name > category > description >
city), with a per-language text search configuration, plus a `pg_trgm` GIN index
for prefix and fuzzy name matching. No separate search service.

## Rationale

At 15,000 rows a GIN-indexed `tsvector` query returns in single-digit
milliseconds. The 400 ms budget is not threatened by the search — it is
threatened by the filter join, which is a composite index problem that a search
engine would not solve. Buying a search engine here buys features, not
performance.

The cost avoided is not the vendor's bill. It is: a second store in the backup
and restore procedure; a synchronisation path that can silently drift, producing
a catalogue that says a partner exists and a search that says it does not; a
second thing to secure and to include in the sub-processor list; and a second
failure mode in [reliability.md §3](../reliability.md#3-failure-modes). For a
three-person team, the operational surface is the real price.

Keeping search in the database also makes one thing genuinely correct that is
awkward otherwise: search results respect the same publication predicate
(`approved ∧ listing_active`) as every other read, in the same query, in the same
transaction. With an external index there is always a window where an unpublished
company is still findable, and that window is a privacy and a commercial problem
at once.

The known limitation is honest: no typo tolerance beyond trigram similarity on
names, no synonyms, and per-language rather than unified cross-language ranking.
A member searching "attorny" finds nothing. We measure that directly through the
`catalogue_zero_result_ratio` metric in
[observability.md §4](../observability.md#4-metrics), so the decision to
reconsider will be made from data rather than from a hunch.

## Alternatives considered

|Option|Why not|
|-|-|
|Elasticsearch / OpenSearch|The most capable and the most expensive to operate. A cluster to run, secure, back up and upgrade for 15,000 rows is disproportionate by roughly three orders of magnitude|
|Algolia|Excellent product, near-zero operations. Rejected on two grounds: catalogue content would be replicated to a third party and its search API keys are exposed to the browser by design, which conflicts with a catalogue that is authenticated-only; and pricing is per search operation, which grows with exactly the behaviour we want to encourage|
|Typesense / Meilisearch (self-hosted)|Cheaper than Elasticsearch and genuinely good at typo tolerance. Still a second stateful service with its own backup, sync and failure story|
|Typesense Cloud / Meilisearch Cloud|Removes the operations but keeps the sync path and adds a sub-processor, for features we do not yet know we need|
|Plain `ILIKE` matching only|Would work at 50 rows and degrade badly by 2,000; no ranking at all, so the most relevant partner is wherever the index put it. It remains the documented fallback when the search vector is unavailable|
|`pgvector` semantic search|Interesting for "find me a lawyer who handles immigration" phrased naturally. Premature: it needs embeddings, an embedding vendor, and a much larger catalogue before ranking quality beats keyword matching|

## Consequences

**This makes easy:** one datastore, one backup, one restore, one thing to
monitor; search results that are transactionally consistent with the catalogue
and respect the same visibility rules; zero synchronisation code and therefore
zero synchronisation bugs; rebuilding the entire index with one `UPDATE`.

**This makes hard:** typo tolerance, synonyms ("realtor" / "estate agent"),
unified ranking across three languages in one result set, and faceted relevance
tuning. Stemming quality for Ukrainian in PostgreSQL is weaker than for English
or Russian, which will show first.

**We accept:** worse search quality than a dedicated engine would give, in
exchange for one fewer system. We accept it knowingly, and we instrument the
zero-result ratio so the trade is visible rather than assumed.

## Implementation note (2026-08-17)

This decision named "a per-language text search configuration" without
pinning down which one. PostgreSQL ships no built-in `ukrainian` text search
configuration, and a company's name/description is one mixed-language field
per row with no language marker to switch on - so a single `tsvector` column
cannot dispatch to a different config per row. The implementation uses
`simple` (tokenises and lowercases, no stemming) uniformly for all three
languages: it trades away stemming equally across en/ru/uk rather than
leaving Ukrainian uniquely worse, which reads as the more faithful version of
this decision's own accepted trade-off. `pg_trgm` similarity on `name` covers
the typo/prefix tolerance a stemmed config would otherwise help with.

## Revisit if

- The catalogue exceeds roughly 100,000 published companies
- `catalogue_zero_result_ratio` stays above 15% for a month, and query-log
  review shows the cause is typos or vocabulary rather than a genuinely thin
  catalogue
- Search p95 exceeds 400 ms after index tuning
- Cross-language search becomes a stated member requirement — a member searching
  in Russian expecting to find an English-only listing is the case that
  PostgreSQL handles worst
