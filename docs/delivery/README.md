# Delivery

> **Status:** Draft
> **Owner:** _(fill in)_
> **Last updated:** 2026-08-03
> **Write when:** before the first task is started.

Everything else in `docs/` describes what the system must be. This describes how
it gets built: the order of the work, the size of a step, and the check that says
a phase is finished. [CONTRIBUTING.md](../../CONTRIBUTING.md) covers how a change
gets merged and released — that is a different question and is not repeated here.

---

## 1. The team, stated honestly

One person, working with AI assistance. No second reviewer, no QA, no on-call
rotation.

This contradicts parts of the documentation set, which was written for a team of
three: [CONTRIBUTING.md](../../CONTRIBUTING.md) requires two reviewers on
`billing`, [documentation.md §2](../documentation.md#2-ownership) names four
owners, [testing.md §7](../testing.md#7-manual-and-specialist-testing) assigns
work to QA. Those documents are corrected in T-0.18 rather than quietly ignored,
because a process document that describes a team that does not exist is the first
thing to stop being true, and by [documentation.md](../documentation.md)'s own
rule that is worse than having none.

**What replaces human review:** automation, and an adversarial second pass by an
agent that did not write the code. Every rule currently phrased as "the reviewer
checks…" becomes a test, a lint rule or a type — or it does not happen. The four
questions in [CONTRIBUTING.md](../../CONTRIBUTING.md#review-standards) map onto
the four exhaustive suites in
[testing.md §3](../testing.md#3-what-must-be-tested), and those suites are built
in phase 0.

**What does not get faster:** A2P 10DLC registration, Stripe test-clock
verification, the client's legal decisions, the moderation dry-run, the
penetration test, and localisation review by native speakers. Code production
accelerates; none of these do. **The critical path is therefore made of
non-code items,** and the plan is sequenced around them rather than around
implementation effort.

---

## 2. Phases and sprints

The phases are fixed by
[requirements.md §6.1](../requirements.md#61-delivery-plan). One file per phase in
this folder expands a row of that table into work. The FR ranges in the two places
must agree; `tools/check-plan.py` fails if they do not.

**The overlap in §6.1 does not apply.** It was justified by frontend work
proceeding while another phase's backend was verified, which needs two people.
Phases run in sequence, and the week numbers in §6.1 are read as effort, not as
dates.

**Sprint = one week.** Not a ceremony — the branch age limit is already three
days, so a longer sprint would only be reporting laid over a continuous flow. A
sprint is: pick tasks from the current phase file on Monday, deploy to staging
and update `.state/state.json` on Friday.

**A task is one working session.** Not one pull request and not one FR — one
session, because that is the unit that fits in a context window and can be
verified before it is forgotten. A task that cannot be briefed in five minutes is
badly cut.

---

## 3. Task format

Each phase file carries one table with these columns:

|Column|Means|
|-|-|
|Task|`T-<phase>.<n>`, stable once written. Referenced by branches and commits|
|Delivers|What exists afterwards that did not before, in one line|
|FR|The requirements this task satisfies **completely**, or `—` for infrastructure. Partial delivery of an FR is a badly cut task|
|Depends on|Task ids that must be finished first|
|Est|Days of focused work|

**An FR belongs to exactly one task.** If two tasks touch it, one of them owns it
and the other says so in prose. This is what makes coverage checkable.

**A task is done when** the FR it names is fully satisfied,
[testing.md §8](../testing.md#8-definition-of-done) passes, and the phase file is
updated. Partial completion is recorded as partial, naming which FR is
outstanding — see the reporting rule in [CLAUDE.md](../../CLAUDE.md).

---

## 4. Phase gate

At the end of a phase, in this order:

1. Every task in the file is closed, or explicitly moved to a later phase with a
   reason.
2. The exit criterion from [requirements.md §6.1](../requirements.md#61-delivery-plan) is
   demonstrated by running the demo script in the phase file — on staging, not
   locally, and not from memory.
3. `python tools/check-plan.py --strict` and
   `python tools/check-docs.py --strict` pass.
4. [requirements.md](../requirements.md) is reviewed, as
   [documentation.md §6](../documentation.md#6-review-cadence) requires at every
   phase boundary. Assumptions in §7 that have been proved or disproved are
   updated; open questions in §9 that are now answerable are closed.
5. The next phase file is written before its first task is started.

A phase that misses its exit criterion is not extended silently. Either scope
moves out of it with a note, or the schedule moves — recorded either way.

---

## 5. Sequencing rules

Three rules that override effort-based ordering:

**Constraints before the features they constrain.** The member-leak walker, the
object-level authorization replay, the role matrix and the audit-completeness
suite are built in phase 0 against an empty route table. They cost little then
and are near-impossible to retrofit once there are forty routes, and they are the
only thing standing between confident code generation and a violated product
promise.

**Lead-time items on day one.** Anything with an external clock — carrier
registration, vendor approval, a decision that belongs to the client — starts
before the code that depends on it, not when the code reaches it.

**Riskiest integration before the largest surface.** Billing is verified against
Stripe test clocks (phase 3) before the staff console (phase 5) is built, as
§6.1 already sequences. Do not reorder those two for convenience.

---

## 6. What is checked mechanically

|Tool|Checks|
|-|-|
|[`tools/check-plan.py`](../../tools/check-plan.py)|Every FR is claimed by exactly one task; no task cites a non-existent FR; a phase's tasks stay inside its FR range in §6.1; task dependencies exist; once tests exist, every claimed FR is named by at least one test|
|[`tools/check-docs.py`](../../tools/check-docs.py)|Broken links, missing owners, stale dates, remaining placeholders|
|`.state/state.json`|Current phase, sprint and task — so a new session starts from a position rather than from 4,600 lines of documentation|

The traceability matrix is not written. It is computed, for the same reason the
API schema is generated: a matrix maintained by hand is a matrix that is wrong.

---

## 7. Phases

|Phase|File|Status|
|-|-|-|
|0 — Foundations|[phase-0.md](phase-0.md)|In progress|
|1 — Identity and card|_(not yet written)_|Blocked by open questions — see T-0.5|
|2 — Catalogue and onboarding|_(not yet written)_|—|
|3 — Billing|_(not yet written)_|—|
|4 — Private beta|_(not yet written)_|—|
|5 — Staff console|_(not yet written)_|—|
|6 — Referrals|_(not yet written)_|—|
|7 — Hardening and launch|_(not yet written)_|—|

A phase file is written at the gate of the phase before it, not now. Writing all
eight today would produce seven documents describing work whose shape will be
known only after the phases before them are finished — and rewriting them later
costs more than the planning is worth.

**One gap found while writing this, and left visible rather than fixed:**
[requirements.md §6.1](../requirements.md#61-delivery-plan) assigns FR ranges to
phases 1, 2, 3, 5 and 6, but the platform-wide requirements FR-090…FR-098
(locales, themes, legal documents, data export, PWA) belong to no phase. Phase 7
describes them in prose without numbering them. `check-plan.py` reports them as
unclaimed. They need assigning at the phase 0 gate — that is T-0.19, and it is a
scope decision, not a documentation tidy-up.
