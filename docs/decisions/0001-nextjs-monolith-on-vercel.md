# 0001. Build KCLUB as one Next.js modular monolith on Vercel

> **Status:** Accepted
> **Date:** 2026-08-02
> **Deciders:** Tech lead, client

## Context

KCLUB has four visible surfaces — a public marketing site, an authenticated
member area, a staff console and a public card-verification page — plus
asynchronous work driven by Stripe webhooks. The obvious modern shape is a React
SPA against a separate API service, and the obvious "scalable" shape is a set of
services split by domain.

The constraints at the moment of deciding: three engineers, about fifteen weeks
to a public launch, no dedicated platform engineer, and no on-call rotation. The
projected load after twelve months is 25,000 members and roughly 50 requests per
second — small by any measure. The client had explicitly chosen a managed
platform over self-managed infrastructure.

The parts of the domain are tightly coupled by design rather than by accident: a
card's tier depends on billing, a company's publication depends on both
moderation and billing, and a referral's permission depends on billing and the
catalogue. Splitting those apart puts a network between decisions that must be
made together.

## Decision

We will build and deploy KCLUB as a single Next.js 15 application on Vercel — one
repository, one deployable unit, one database — organised internally as a modular
monolith with enforced module boundaries and a framework-independent
`src/domain` layer.

## Rationale

We optimised for time to a correct first release and for the number of things
that can break at 3 a.m., in that order.

One deployment means one authentication surface, one authorization model, one
place a request can fail, and local transactions instead of distributed ones.
The flows that matter most — verify a phone and issue a card; receive a payment
and grant access — become single database transactions rather than sagas with
compensating actions.

Server Components decide the SPA question on their own: catalogue and member
data are queried on the server and rendered to HTML, so the browser never
receives a list it is merely not displaying. For a product whose promise is that
members are not listed, that is a security property, not a performance one.

The `src/domain` layer is what stops "monolith" meaning "tangle". It imports no
React and knows nothing of HTTP, so the expensive part — the business rules — is
portable if the host ever becomes wrong. A lint rule forbids database calls
outside `src/data` and imports across module internals; without enforcement, a
modular monolith is a monolith within a sprint.

## Alternatives considered

|Option|Why not|
|-|-|
|React SPA + separate API service|Doubles the auth surface; forces every catalogue read through a public endpoint that must then be defended against enumeration; costs SEO on the marketing site, which is the acquisition channel; two deployments to keep in step for no capability we need|
|Microservices split by domain (identity, billing, catalogue)|Replaces function calls with network calls and transactions with sagas, to buy independent scaling that 50 rps does not require. With three engineers it also means each service is owned by nobody in particular|
|Next.js frontend + a separate NestJS/Fastify backend|The conventional "serious" split. It buys the ability to scale the API separately and to reuse it from a native client — neither of which exists in this project or its near roadmap. Revisit when a second first-party client appears|
|Astro (marketing) + separate React app (member area)|Splits the codebase in two for marketing performance that Next.js already delivers, and duplicates the design system across two build setups|
|Containers on AWS ECS or Fly.io instead of Vercel|Adds two to three weeks of infrastructure work at the start of a fifteen-week schedule, and a permanent operational surface, in exchange for portability we can obtain later at similar cost. The client explicitly preferred managed|

## Consequences

**This makes easy:** shipping quickly with a small team; keeping billing,
identity and catalogue consistent in single transactions; reasoning about a
request end to end; one CI pipeline; one rollback.

**This makes hard:** scaling any one part independently; isolating the blast
radius of a bad deploy, which currently takes down the member area and the staff
console together; adopting a second language for any component; running the
staff console during a member-area incident.

**We accept:** vendor lock-in at the application host, and a single deployment as
a single point of failure. The lock-in is bounded on purpose — the application is
a standard Node.js server, the database is standard PostgreSQL, and object
storage speaks S3 — so leaving Vercel is a week of deployment work and none of
product work. We also accept that the modular boundaries hold only as long as
the lint rules do, and that a team under deadline pressure will test them.

## Revisit if

- The team exceeds roughly eight engineers, and merge contention or ownership
  ambiguity becomes a weekly cost
- A second first-party client appears (a native application or a partner API),
  making a standalone API surface something we need rather than something we
  would maintain for its own sake
- Compute cost exceeds roughly $3,000/month, where containers on a cloud provider
  start to be cheaper than the platform premium
- A regulatory requirement forces data residency in a second region, which the
  current single-region deployment cannot satisfy
- A single module's load diverges by more than an order of magnitude from the
  rest — the only technically honest reason to extract a service
