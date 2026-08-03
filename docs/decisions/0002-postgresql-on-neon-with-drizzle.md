# 0002. Use PostgreSQL on Neon, with Drizzle, as the only datastore

> **Status:** Accepted
> **Date:** 2026-08-02
> **Deciders:** Tech lead, backend engineer

## Context

The domain is relational — members own cards, companies belong to categories and
cities, subscriptions attach to members or companies, referrals connect two
companies — and the volumes are small: under 60 GB and under 15,000 catalogue
rows at the three-year design ceiling in
[requirements.md §5.3](../requirements.md#53-scalability).

Four needs looked at first glance like they wanted their own service: full-text
search over the catalogue, a job queue for webhook projection and scheduled work,
JSON storage for audit-log diffs, and rate-limit counters. Each additional store
is something to secure, monitor, back up, restore and reason about during an
incident, and we have three engineers and no platform specialist.

Serverless functions complicate the connection story: many short-lived
invocations, each wanting a connection, against a database that thinks in
sessions.

## Decision

We will use a single PostgreSQL 17 database on Neon as the source of truth for
everything the application owns, accessed exclusively through Drizzle ORM via
Neon's pooled endpoint. Redis (Upstash) is used only for ephemeral counters and
is never authoritative.

## Rationale

PostgreSQL absorbs three of the four needs above without a second service:
`tsvector` with `pg_trgm` covers catalogue search at our scale
([0006](0006-postgres-full-text-search.md)), a transactional outbox table covers
queueing without losing atomicity with the domain write
([0008](0008-durable-background-jobs-with-inngest.md)), and `jsonb` covers audit
diffs. Every one of those choices is reversible later and none of them costs an
operational surface now.

Neon adds three things specifically wanted here. Its pooled endpoint solves the
serverless connection problem without us running PgBouncer. Database branching
gives every pull request a real database seeded from the schema, which is what
makes the integration-heavy test strategy in [testing.md](../testing.md)
affordable. And 30-day point-in-time recovery to a branch means a restore is
non-destructive and inspectable before promotion, which turns the scariest
runbook into a routine one.

Drizzle over Prisma is a smaller decision made on two grounds: it has no query
engine binary, so cold starts in serverless functions stay low and preview
environments stay simple; and its API is SQL-shaped, so the query that runs is
the query that was written — which matters when the performance budget for the
catalogue is 400 ms and the tuning is index work.

The strict rule that all SQL lives in `src/data` is what makes the authorization
model in [security.md §2](../security.md#2-authentication-and-authorization)
enforceable: ownership filters live inside repository functions, and a lint rule
prevents a convenient query from bypassing them.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Supabase (PostgreSQL + auth + storage + RLS) | The bundle's main value is auth, which we self-host anyway ([0003](0003-self-hosted-phone-authentication.md)). Row-level security as the primary authorization mechanism is hard to test, hard to review, and trivially bypassed by a service-role key that any server-side code can hold |
| PlanetScale / MySQL | No native full-text ranking, weaker `jsonb`, no transactional DDL. The branching workflow is excellent, but Neon offers it on the engine we want |
| MongoDB / DynamoDB | The domain is relational and the money is transactional. Modelling subscriptions and entitlements without transactions is how double-provisioning bugs are written |
| Amazon RDS / Aurora | More operational surface (parameter groups, patching windows, VPC networking) for a database that will not exceed 60 GB. No branching, so preview environments become fixtures again |
| PostgreSQL + Elasticsearch for search | See [0006](0006-postgres-full-text-search.md) |
| PostgreSQL + a dedicated queue (SQS, RabbitMQ) | Breaks atomicity between the domain write and the enqueue unless an outbox is added anyway — at which point the outbox is doing the work and the broker is optional |
| Prisma as the ORM | Heavier cold start, a query engine binary to ship, and generated SQL that is harder to reason about when tuning. Better developer experience for engineers who do not know SQL; that is not this team |

## Consequences

**This makes easy:** transactional correctness across the whole domain; one
backup and one restore procedure; a real database per pull request; tuning by
reading the SQL; adding a second read replica later as a configuration change.

**This makes hard:** anything genuinely needing a specialised store — vector
search, time-series at scale, typo-tolerant multilingual search. Also, one
database is one blast radius: a runaway query in the staff console can affect
member traffic until a read replica exists.

**We accept:** a single database as a single point of failure, with no
cross-region replica at launch; and dependence on Neon specifically for pooling,
branching and PITR — features whose loss would mean re-solving three problems,
even though the data itself is standard PostgreSQL and portable by `pg_dump`.

## Revisit if

- The primary database exceeds ~500 GB or sustained CPU stays above 70% after a
  read replica is added
- Search requirements grow to need synonyms, typo tolerance or unified
  cross-language ranking ([0006](0006-postgres-full-text-search.md))
- Neon's pricing at our scale exceeds a managed RDS equivalent by more than 2×
- A regulatory requirement forces EU data residency, which would mean a second
  database and a genuinely different data architecture
