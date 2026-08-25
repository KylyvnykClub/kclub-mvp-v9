# 0017. Project the entitlement in the webhook's own invocation, after the response has been sent

> **Status:** Accepted
> **Date:** 2026-08-23
> **Deciders:** Launch owner

## Context

[FR-026](../requirements.md) requires the card to reflect a tier change within
**60 seconds** of the subscription state changing. Priority Must.

What production actually does, measured on 2026-08-23: the webhook endpoint
verifies the signature, records the event id and writes an outbox row
([route.ts:50](../../src/app/api/webhooks/stripe/route.ts)). Nothing projects
until `/api/cron/outbox-drain` runs, and `vercel.json` schedules that as
`5 0 * * *` — **once per day**. A member who pays at noon sees VIP the following
morning. The bound is missed by roughly 1440×, on a Must requirement, on the
one path where [CLAUDE.md](../../CLAUDE.md) constraint #2 says money and access
must never disagree.

Three facts constrain the answer, and two of them contradict what the documents
currently say.

**The daily schedule was not a choice about latency.** Vercel's Hobby plan
rejects sub-daily cron expressions, so PR #48 reduced `outbox-drain` from every
minute and `subscription-lapse` from every two minutes to daily (backlog
`cron-jobs-daily-only-on-hobby-plan`). The schedule changed; the requirement did
not, and nobody renegotiated it. [phase-1.md:14](../delivery/phase-1.md) still
states that FR-026's bound is "carried by the outbox-drain cron's one-minute
cadence" — a sentence that stopped being true at PR #48 and was never corrected.

**Inngest is not installed.** [ADR 0008](0008-durable-background-jobs-with-inngest.md)
decided that a dispatcher hands outbox work to Inngest, and
[integration.md §3](../integration.md#3-inbound-api) lists `POST /api/inngest`
in its complete list of public endpoints. Neither exists: `inngest` appears in no
dependency in `package.json`, and there is no route, no client and no function
definition anywhere in `src`. So "move the drain to Inngest" is not a move
between two things we have. It is an installation, on the critical path of a
payment that is already broken in production.

**The handler contract forbids exactly what is needed.**
[integration.md §4](../integration.md#4-webhooks-and-events) states it verbatim:
verify the signature, insert the event id, write an outbox row, return 200 —
_and do nothing else_ — "because a webhook handler that does real work will
eventually be slow, and a slow handler makes the sender retry, and retries
against a handler that is already half-finished are how double-provisioning
happens." That reasoning is about **response latency**, not about the work
itself.

## Decision

We will project the entitlement inside the webhook's own invocation, in a
Next.js `after()` callback that runs **once the 200 has already been sent**,
and keep the outbox row as the durable record and the cron drain as the retry
sweep.

## Rationale

The contract's "do nothing else" exists to keep Stripe's response timer short.
`after()` removes the reason rather than breaking the rule: the response is
already on the wire when the projection starts, so Stripe's timer has stopped
and no amount of slowness in the fold can cause a retry. The work still runs in
the same serverless invocation, on the same deployment, with the same
environment and the same logs.

Everything that makes the current design correct is untouched. The outbox row is
still written in the same transaction as the event id, so atomicity is
unchanged. The fold in `src/modules/billing/projection.ts` is not modified — it
is the piece proven by the AC-03 rehearsal against a real test-mode
subscription and a test clock, and it stays proven. If the `after()` work fails
or the invocation is killed, the row is left exactly as it is left today:
unprocessed, waiting for the next drain. The fast path becomes fast; the
durable path is the one we already have.

It costs nothing, adds no vendor, no second deployment target and no new public
endpoint — which matters when the thing being fixed is a production payment that
has been silently failing, and every hour of installation work is an hour that
path stays broken.

What this optimises for is **time to a working entitlement**, explicitly at the
expense of execution durability. That is the assumption most likely to change
(see _Revisit if_).

## Alternatives considered

|Option|Why not|
|-|-|
|Raise the cron frequency by moving to Vercel Pro|Not rejected — **complementary, and worth doing for a different reason**. A one-minute cadence puts the worst case _at_ the 60-second bound rather than inside it, so it is a poor primary answer for FR-026; but it is the only thing that fixes **retry** latency, which `after()` does not. See _Consequences_|
|Install Inngest and dispatch to it, per ADR 0008|The right long-term home, and the one the documents already claim. Rejected **for now, not on the merits**: it is a new dependency, a new public endpoint, signing keys in two environments and a dispatcher, none of which exist today, all on the critical path of a broken payment. ADR 0008's real value — step semantics, replay, a dead-letter queue — is worth having when there is a multi-step job that needs it. Reversing into it later costs one function and one route, because the outbox stays|
|Drain the outbox inline, **before** returning 200|This is what integration.md §4 forbids, and its reasoning is correct: it puts a Stripe API round-trip and the fold inside Stripe's delivery window, so a slow Stripe or a slow database turns into a retry against a half-finished handler. `after()` gets the same latency with none of this|
|Project directly from the webhook payload instead of re-fetching|Faster by one API call and forbidden by [ADR 0004](0004-stripe-billing-as-system-of-record.md): we re-fetch so that a payload we did not generate cannot grant an entitlement Stripe does not agree with|
|Grant the tier from the checkout redirect or from client state|The specific failure [ADR 0004](0004-stripe-billing-as-system-of-record.md) exists to prevent. It would make the symptom disappear while making the constraint violation permanent|
|Renegotiate FR-026 to a bound the daily cron can meet|Honest, and available if the owner prefers it — a requirement quietly missed is worse than one deliberately relaxed. Rejected because "your card updates tomorrow" is not a membership product, and because the fix is a day's work rather than a quarter's|

## Consequences

**This makes easy:** a tier change lands about a second after Stripe reports it,
well inside FR-026, with no plan change, no vendor and no new endpoint. The
outbox, the fold and the AC-03 evidence all keep their meaning.

**This makes hard:** the **retry** path. If the `after()` projection fails —
Stripe API down, database unreachable, invocation killed — the row waits for the
next scheduled drain, and on the Hobby plan that is up to 24 hours away. The
happy path moves from ~1440× over budget to inside it; the unhappy path does
not move at all. Moving to a plan with minute-level cron is what fixes that, and
it is a decision about money, not architecture.

**We accept:**

- The webhook invocation now does real work, so its duration and its cost track
  event volume rather than being constant. At this product's volume that is
  noise, and at a volume where it is not, Inngest is the answer.
- `after()` is a Next.js 15 guarantee that the callback runs after the response,
  not a guarantee that it completes. It is best-effort execution on top of a
  durable record — which is precisely the shape the outbox exists to support.
- **A concurrency defect this change makes reachable, fixed in the same commit
  by running the whole drain inside one transaction.** `drainOutbox` selects `FOR UPDATE SKIP LOCKED` but runs
  outside an explicit transaction
  ([outbox.ts:16](../../src/data/outbox.ts)), so the row lock is released when
  the statement's implicit transaction commits — microseconds later, and long
  before `markProcessed` runs. Today that is harmless because exactly one drain
  runs per day. With a drain per webhook it is not: two overlapping drains can
  take the same row. For the billing topic the fold is idempotent and
  watermark-guarded, so a double take is wasted work rather than a wrong
  entitlement; for `BILLING_NOTIFICATION_TOPIC` and `COMPANY_MODERATION_TOPIC`
  it is a duplicate email to a member.

## Revisit if

- A second multi-step background job appears — one that must resume mid-way
  rather than re-run — or webhook volume makes per-event invocation duration
  visible in the bill. Either is the trigger to install Inngest and honour
  [ADR 0008](0008-durable-background-jobs-with-inngest.md) rather than keep
  documenting a dependency that is not there.
- The plan changes to one with minute-level cron, at which point the retry sweep
  becomes fast enough that the residual risk in _Consequences_ is gone.
- A projection failure is ever observed to sit unprocessed for hours. That is
  the residual risk becoming a real incident, and it should force the plan
  question rather than be absorbed.
