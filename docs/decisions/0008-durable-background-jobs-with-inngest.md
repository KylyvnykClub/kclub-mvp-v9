# 0008. Run background work on Inngest, fed by a transactional outbox in PostgreSQL

> **Status:** Accepted
> **Date:** 2026-08-02
> **Deciders:** Tech lead, backend engineer

## Context

Several things must happen outside the request that triggers them: projecting
Stripe events into entitlements, expiring entitlements when a paid period ends,
reconciling with Stripe nightly, expiring referrals and deleting their contact
data after 14 days, running dunning notifications, sweeping abandoned
registrations, deleting accounts 30 days after a request, and sending every
transactional message.

Some are scheduled, some are event-driven, and several are multi-step with a
failure point in the middle. Two of them — entitlement projection and referral
data deletion — are correctness-critical: one is money, the other is a legal
obligation.

The deployment target is serverless functions on Vercel
([0001](0001-nextjs-monolith-on-vercel.md)), which gives no long-running
process. That rules out the conventional answer of a worker process consuming a
queue, unless we introduce a second deployment target purely to host it.

The subtler problem is atomicity. "Write the row and enqueue the job" is two
systems. If the enqueue happens first and the transaction rolls back, work runs
for something that never happened. If the write happens first and the enqueue
fails, the effect is silently lost — and "silently lost" is the failure mode
this product can least afford, because nothing errors and nobody notices until a
member complains that they paid.

## Decision

Domain code never enqueues a job directly. It writes an **outbox row inside the
same transaction** as the domain change. A dispatcher reads the outbox and hands
work to **Inngest**, which provides durable multi-step functions, retries with
backoff, cron scheduling, replay and a dead-letter queue.

## Rationale

The outbox is the part that provides correctness, and it is ours. Because the
outbox row commits with the domain write, there is no window in which one exists
without the other. If the dispatcher is down for an hour, the rows wait; when it
returns, everything drains. Nothing is lost, and `outbox_oldest_age_seconds` is
a single number that tells us whether background processing is alive — which is
why it is an alert in
[observability.md §7](../observability.md#7-alerting).

Inngest is the part that provides durability of execution, and it is bought.
Its step model matters for the multi-step jobs: a function that retrieves a
subscription, updates an entitlement, publishes a company and sends a
notification can fail at step three and resume at step three, rather than
re-running steps one and two with whatever side effects they carry. Building
that on top of a queue is a project.

It also fits the deployment model exactly: Inngest calls back into our own HTTP
endpoint, so jobs run on the same serverless functions as everything else — same
code, same deployment, same observability, same environment variables. No second
runtime, no second thing to deploy, no worker to keep warm.

Vercel Cron alone was seriously considered and rejected: it is a plain HTTP
trigger with no retry, no step semantics, no replay, and no visibility into a
job that half-ran. It survives as the trigger for exactly one thing — the health
canary — where those properties do not matter.

## Alternatives considered

|Option|Why not|
|-|-|
|Vercel Cron + our own dispatcher only|No retries, no step semantics, no replay, no dead-letter queue. Everything Inngest gives would have to be built, and the parts that look easy (backoff, poison-message handling, idempotent resumption) are the parts that are subtly wrong for a year|
|BullMQ / pg-boss with a worker process|pg-boss is genuinely attractive — it removes a vendor and lives in the database we already have. Rejected because it needs a long-running process, which means a second deployment target (a container somewhere) purely to host it, and that is a bigger operational addition than the vendor it removes|
|Trigger.dev|Very close to Inngest in capability and a reasonable alternative. Chosen against on maturity of the serverless-callback model and on pricing at our volume; not a strong preference, and the outbox is what makes the choice cheap to reverse|
|AWS SQS + Lambda|Introduces an entire second cloud account, IAM, and deployment pipeline into a stack that deliberately has none|
|Do the work synchronously in the request|Fails immediately for anything scheduled, and for webhook handling it is the specific mistake that causes double-provisioning: a slow handler makes Stripe retry ([0004](0004-stripe-billing-as-system-of-record.md))|
|Enqueue directly to Inngest without an outbox|Simpler by one table, and loses atomicity with the domain write. This is the whole point of the decision|

## Consequences

**This makes easy:** guaranteeing that a committed domain change eventually has
its effect; retrying safely, because every job is idempotent and resumes at the
failed step; scheduling without a scheduler to run; one number that tells us
whether async processing is healthy; replaying a failed job after fixing the bug
that broke it.

**This makes hard:** every effect is now eventually consistent, and a developer
must think about ordering and idempotency rather than calling a function.
Debugging spans a request, a table and a worker, which is why the trace context
is carried on the outbox row. There is also a dispatcher to keep running, which
is itself a thing that can stop.

**We accept:** a dependency on a young vendor for execution, and one extra table
plus a dispatcher for correctness. The trade is deliberate: the correctness
mechanism is ours and portable, the execution mechanism is bought and
replaceable. Moving from Inngest to pg-boss or Trigger.dev later means changing
the dispatcher, not the domain.

## Revisit if

- Inngest's pricing at our job volume exceeds roughly $200/month
- We move to containers for any other reason, at which point pg-boss removes a
  vendor at almost no cost
- A job needs more than Inngest's step-duration limits, such as a very large
  backfill — which today is handled by batching inside the job
- Outbox depth becomes a bottleneck, which at our volume would indicate a bug
  rather than growth
