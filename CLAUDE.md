# SESSION PROTOCOL

> **IMPORTANT: Follow this protocol at the start of EVERY conversation and after /clear**

## On Session Start

1. **State is auto-loaded** via SessionStart hook (`.state/state.json` + `.state/handoffs.json`; legacy `.claude/...` still loads during migration)

2. **Brief summary** (don't force handoff engagement):

   ```text
   "Last session: [X]. [N] backlog items.
   [If handoffs exist: '1 active handoff: auth-system (Phase 2/3)']
   What would you like to work on?"
   ```

3. **Let user drive** — they might:
   - Say "continue auth" → pick up the handoff
   - Say "start the server" → do that, handoff stays pending
   - Say "what's the handoff about?" → explain it
   - Say anything else → do that

**Don't ask "Continue?" about handoffs** — just mention they exist. User decides.

## Resuming Handoffs

When user runs `/handoff --continue` or says "continue" and there's an active handoff:

1. **Read the handoff file** (`.state/handoffs/{id}.md`) for goal, phases, and learnings
2. **Check `lastTouched`** — if recent, warn about possible session conflict
3. **Update `handoffs.json`** as you complete phases (set `status: "complete"`, add `learnings`)
4. **Capture insights** — what worked, what didn't, for future sessions

**Principles:**

- **Context first** — review prior learnings before acting
- **No rushing** — thoroughness over speed
- **Validate before marking complete** — concrete evidence must exist
- **Clean handoffs** — if context runs low, update notes so next session continues seamlessly

**Parallel sessions:** Multiple handoffs = multiple sessions OK. Same handoff = one session only.

## Commands Available

- `/commit` - Commit changes (clean, no AI mentions)
- `/push` - Push + update local state + clean up completed handoffs
- `/backlog` - Review and manage backlog items
- `/handoff` - Create handoff (`--continue` to resume active one)

## Rules

- Only USER sets `currentFocus` - never assume or change it
- Add discoveries to backlog during `/push`, not randomly
- Keep backlog clean - resolve items when addressed
- **Never commit on your own** - wait for user to run `/commit`
- **Handoffs**: Update `handoffs.json` progress after completing phases

---

Context contract for KCLUB. Read before writing anything in this repository.

This file is the index, not the source. The authority is `docs/` — 14 documents,
10 decision records, ~90 numbered requirements, all written before any code
existed. When this file and a document disagree, the document wins and this file
is wrong and must be fixed.

**Current state:** documentation complete, implementation in phase 0. The plan
lives in [docs/delivery/](docs/delivery/); the position in it lives in
`.state/state.json`.

---

## The three constraints

These are the product, not preferences. Each has a decision record, an
enforcement test, and a history of being violated by someone building something
perfectly reasonable.

1. **No member is ever disclosed to another member.** No member directory, no
   people search, no member-to-member messaging, no endpoint that returns a
   collection of members to a member-scoped actor.
   ([ADR 0005](docs/decisions/0005-no-member-directory.md))
2. **Money and access must never disagree.** Entitlements are projected from
   Stripe webhooks as a fold over events, never from a checkout redirect, never
   from client state. ([ADR 0004](docs/decisions/0004-stripe-billing-as-system-of-record.md))
3. **This is structurally not MLM.** No referral code, no downline, no
   commission, no invite quota, no reward for introducing anyone. A "referral"
   here is a client introduction between two businesses, with recorded consent
   and a hard quota. ([ADR 0009](docs/decisions/0009-referral-data-minimisation.md))

**If a task appears to require breaking one of these, stop and say so.** Do not
implement a narrower version of it. The correct output is a question, not a
compromise.

---

## Where to look

Do not read all of `docs/` for every task. Read the rows that apply.

|Working on|Read first|
|-|-|
|Anything at all|This file, then [docs/delivery/](docs/delivery/) for the current phase|
|A new feature|The FR text in [requirements.md §4](docs/requirements.md#4-functional-requirements) — it is normative, including its numbers|
|Where code goes|[architecture.md §2](docs/architecture.md#2-components)|
|How a flow works end to end|[architecture.md §3](docs/architecture.md#3-key-flows)|
|Naming anything|[glossary.md](docs/glossary.md) — one concept, one name, in three languages|
|Screens, states, copy|[ux.md](docs/ux.md)|
|Tables, columns, retention|[data-storage.md](docs/data-storage.md)|
|Auth, permissions, PII|[security.md](docs/security.md)|
|Stripe, Twilio, Resend, R2|[integration.md](docs/integration.md)|
|What to test and how|[testing.md](docs/testing.md)|
|Alerts, SLOs, incidents|[reliability.md](docs/reliability.md), [observability.md](docs/observability.md)|
|A choice that is hard to reverse|[decisions/](docs/decisions/) — read the relevant record, then write a new one|

---

## Stack

TypeScript 5.9 strict · Next.js 15 App Router, React 19 Server Components ·
Tailwind 4 + shadcn/ui · Node 22 · PostgreSQL 17 on Neon via Drizzle · Upstash
Redis · Inngest · Stripe Billing · Twilio Verify · Resend · Cloudflare R2 ·
Vercel. Rationale and rejected alternatives: [technology.md](docs/technology.md).

Server Components are the default; `'use client'` is an exception that needs a
reason. Server Actions for our own mutations, Route Handlers only where an
external caller exists (Stripe webhook, Twilio webhook, card verification,
health).

---

## Module boundaries

Modular monolith. A module owns its tables; another module asks for the data
rather than reaching into them. Full table: [architecture.md §2](docs/architecture.md#2-components).

`identity` · `membership` · `catalogue` · `moderation` · `billing` ·
`referrals` · `notifications` · `audit` · `platform` ·
`web/{marketing,member,admin,verify}`

Enforced by lint, not by good intentions:

- No import from `modules/*/internal/**` outside the owning module.
- No database call outside `src/data`. SQL exists in exactly one layer.
- `src/domain` imports neither React nor HTTP. If it knows about a `Request`, it
  is in the wrong place.
- A `'use server'` file exports async functions and nothing else. Every export
  becomes a callable endpoint; a shared constant goes in a plain module.

---

## Rules that hold everywhere

- **Zod at every trust boundary.** A Server Action is a public HTTP endpoint;
  validate and authorise it like one. The same schema validates on the client.
- **`assertCan(actor, action, subject)` at the top of every use case.**
  Authorization is never inferred from route placement or from what the UI shows.
- **Time and randomness are injected.** No `Date.now()`, no `crypto.randomUUID()`
  inside `src/domain` — they arrive as dependencies, or the test cannot be
  deterministic.
- **Money is integer minor units.** No floating point ever reaches an amount.
- **Externally triggered writes are idempotent**, with the key enforced by a
  database constraint rather than by remembering.
- **Every mutating staff action writes an audit entry**, and a test proves it.
- **Every user-facing string exists in `en`, `ru` and `uk`.** No hard-coded
  literal in a component.
- **New personal data needs a retention period and a deletion path** before it is
  stored.
- **English** for code, comments, commits, tests and `docs/`. The conversation is
  in Russian; the record is not.

---

## Naming traps

The glossary is short and worth reading once. The mistakes that recur:

|Never|Use|Why|
|-|-|-|
|`User` (in domain code)|`Member`|"User" appears only where `better-auth` forces it, mapped at the boundary|
|"Directory"|"Catalogue"|A directory implies listing people, which is the thing this product does not do|
|"Lead"|"Client referral"|Frames a person as a commodity; the feature's defensibility rests on it being an introduction|
|"Invite"|—|There is no invitation mechanic. Anything named `invite` is a misunderstanding of the model|
|`Partner` as a type|`Company`|A company exists before it is a partner. The interface says partner, the code says `Company`|
|"Customer" for a member|`Member`|`Customer` means a Stripe Customer object and nothing else|

Introducing a domain concept without a glossary row is how drift starts. New
term → new row, same commit.

---

## Definition of done

Full list: [testing.md §8](docs/testing.md#8-definition-of-done). The short form:

- The FR it implements is named, and satisfied — all of it, including the numbers
- Tests name the FR in their titles, so an untested requirement is greppable
- Failure paths tested, not only the happy path: unauthorised, not found, invalid
  input, dependency unavailable
- All blocking CI gates green ([testing.md §6](docs/testing.md#6-ci-gates))
- Documentation updated if a row in
  [documentation.md §3](docs/documentation.md#3-update-triggers) triggered
- Strings in all three locales; audit entry where a staff action was added;
  runbook where an alert was added

**Reporting done when it is not done is the most expensive failure mode in this
repository.** If three of eleven FRs in a task are unimplemented, say which
three. A partial result stated plainly is useful; a partial result reported as
complete corrupts the plan.

---

## Working conventions

- Branch `feat/FR-021-card-qr`, `fix/…`, `chore/…`, `docs/…`. Reference the FR.
- Conventional Commits with a module scope: `feat(billing): project entitlement
from subscription.updated`.
- Keep a change under ~400 lines. Bigger is two changes that were not separated
  in time.
- Never commit a secret. Never paste one into a prompt either.
- Read the file before editing it. Search for existing usage before adding a
  second way to do the same thing.
- `pnpm verify` (typecheck + lint + unit + integration) before claiming anything
  works. `python tools/check-docs.py` and `python tools/check-plan.py` before
  closing a task.

---

## This project is built solo, with AI

Which changes the risk profile in one specific way: **the human review that the
process documents assume is not available at volume.** Every rule that would
otherwise be caught by a second engineer must be caught by a test, a lint rule or
a type. If a correctness property is only guaranteed by someone remembering it,
it is not guaranteed.

Consequences that apply to every task:

- The four constraint suites — member-leak route walker, object-level
  authorization replay, staff role matrix, audit completeness — are built in
  phase 0, **before** the features they constrain. A gate added afterwards is a
  gate that never gets added.
- Anything touching `billing`, `identity` or `audit` gets a second, adversarial
  pass by a fresh agent with no memory of writing it (`/code-review`,
  `/reflect`). Self-review by the session that wrote the code is worth little.
- Plausible-looking output is the failure mode, not obviously broken output. Show
  the test that would fail if the code were wrong.
