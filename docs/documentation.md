# Documentation

> **Status:** In review
> **Owner:** KCLUB Delivery Lead
> **Last updated:** 2026-08-03
> **Write when:** a second person starts maintaining the documentation.

How this documentation set stays true. Every other document describes the
system; this one describes the process that keeps those descriptions from
drifting away from reality.

Documentation that contradicts the code is worse than none, because people
trust it. The rules below exist to make drift visible early.

---

## 1. Documentation map

|Document|Covers|Audience|Location|
|-|-|-|-|
|`README.md`|Project overview, how to run it|Everyone|Repository root|
|[CONTRIBUTING.md](../CONTRIBUTING.md)|How work gets merged and released|Contributors|Repository root|
|[CLAUDE.md](../CLAUDE.md)|The context contract for AI-assisted work|Engineering|Repository root|
|[delivery/](delivery/)|The plan — phases broken into tasks, and what closes a phase|Engineering, client|`docs/delivery/`|
|[brief.md](brief.md)|Problem, users, scope, risk — one page|Everyone|`docs/`|
|[decisions/](decisions/)|Why things are the way they are|Engineering|`docs/decisions/`|
|[requirements.md](requirements.md)|What we build and for whom|Product, engineering|`docs/`|
|[architecture.md](architecture.md)|System structure|Engineering|`docs/`|
|[technology.md](technology.md)|The stack and why|Engineering|`docs/`|
|[ux.md](ux.md)|Screens, flows, states, design system|Design, engineering|`docs/`|
|[glossary.md](glossary.md)|Agreed names for domain concepts, in three languages|Everyone|`docs/`|
|[security.md](security.md)|Threats and controls|Engineering, audit|`docs/`|
|[reliability.md](reliability.md)|Targets, failure, recovery|Engineering, on-call|`docs/`|
|[data-storage.md](data-storage.md)|Data model, retention, backup|Engineering|`docs/`|
|[integration.md](integration.md)|External contracts|Engineering|`docs/`|
|[observability.md](observability.md)|Monitoring and alerting|Engineering, on-call|`docs/`|
|[operations.md](operations.md)|Where each thing is managed: staff console, scheduled jobs, vendor dashboards, commands|Engineering, on-call|`docs/`|
|[testing.md](testing.md)|Quality strategy and gates|Engineering|`docs/`|
|[legal-alignment.md](legal-alignment.md)|Where the executed legal documents and the design disagree, and who decides|Client, counsel, engineering|`docs/` — temporary; delete when every row closes|
|Legal pack (nine documents, v1.0, effective 2026-07-01)|What the club has promised in writing|Members, partners, counsel|[policy/](policy/) — currently `.doc` binaries; to be converted to versioned MDX, see [legal-alignment.md §3](legal-alignment.md#3-defects-inside-the-legal-pack)|
|Runbooks|One page per paging alert: what it means, what to check, how to fix|On-call|`docs/runbooks/` — _(to be written in phase 7; none exist yet)_|
|API specification|The four public REST endpoints, generated from Zod schemas|Engineering|`/api/openapi.json` in non-production environments — generated, never hand-written|
|Database schema|The authoritative shape of the data|Engineering|`db/migrations/` — the migration files _are_ the schema documentation|
|Design file|Screens and components|Design, engineering|Figma — _(link to be added)_|
|Legal documents|Terms, Privacy, Club Rules, Partner Rules, Refunds|Members, partners, counsel|`content/legal/*.mdx`, versioned in the repository and published by the application|
|Environment variables|What must be set, and what each does|Engineering|`src/env.ts` — the Zod schema is the documentation, and the application refuses to boot if it is not satisfied|

**Nothing important lives only in chat.** Decisions reached in a call are written
into a decision record or into the relevant document in the same week, in
English, per [glossary.md](glossary.md#language-conventions). The team's working
language is Russian; the record's is not.

---

## 2. Ownership

A document with no owner will not be maintained. Name a person, not a team.

|Document|Owner|Reviewer|
|-|-|-|
|`README.md`, [CONTRIBUTING.md](../CONTRIBUTING.md)|Tech lead — To be confirmed by launch owner|Client|
|[brief.md](brief.md), [requirements.md](requirements.md)|Client — To be confirmed by launch owner|Tech lead|
|[architecture.md](architecture.md), [technology.md](technology.md), [decisions/](decisions/)|Tech lead — To be confirmed by launch owner|AI Reviewer|
|[data-storage.md](data-storage.md)|Tech lead — To be confirmed by launch owner|AI Reviewer|
|[ux.md](ux.md), [glossary.md](glossary.md)|Tech lead — To be confirmed by launch owner|Designer, client|
|[security.md](security.md)|Tech lead — To be confirmed by launch owner|Client (as the data controller)|
|[reliability.md](reliability.md), [observability.md](observability.md), runbooks|Tech lead — To be confirmed by launch owner|AI Reviewer|
|[integration.md](integration.md)|Tech lead — To be confirmed by launch owner|AI Reviewer|
|[testing.md](testing.md)|Tech lead — To be confirmed by launch owner|AI Reviewer|
|[documentation.md](documentation.md)|Tech lead — To be confirmed by launch owner|Client|
|[delivery/](delivery/), [CLAUDE.md](../CLAUDE.md)|Tech lead — To be confirmed by launch owner|Client|
|[legal-alignment.md](legal-alignment.md), legal pack|Client — To be confirmed by launch owner|Counsel, tech lead|

The names are unfilled because the team is not yet formed. **Assigning them is a
kick-off task, not a later one** — `python tools/check-docs.py` warns on every
unowned document precisely so this cannot be quietly skipped, and the warnings
are expected to be zero before phase 1 ends.

Note the deliberate choice on the two most consequential documents:
[requirements.md](requirements.md) is owned by the client, not by engineering,
because scope is their decision; and [security.md](security.md) is reviewed by
the client, because under GDPR they are the data controller and the
accountability is legally theirs regardless of who writes the controls.

**Handover:** when someone leaves the project, ownership transfers in the same
week, recorded in this table, in `.github/CODEOWNERS`, and in the document's own
header. An orphaned document is stale within a quarter.

Ownership is enforced by [`.github/CODEOWNERS`](../.github/CODEOWNERS), which
adds the owner to any pull request touching their document. Keep that file, the
`Owner` header inside each document, and this table in step — three places is
two too many, but it is what the tooling requires.

---

## 3. Update triggers

|When this happens|Update this|
|-|-|
|A new feature or requirement is agreed|[requirements.md](requirements.md)|
|A screen, flow or interface state is added or changed|[ux.md](ux.md)|
|A new domain term enters the code or the interface|[glossary.md](glossary.md) — including its Russian and Ukrainian forms|
|A component is added, removed or given a new responsibility|[architecture.md](architecture.md)|
|A significant, hard-to-reverse decision is made|[architecture.md](architecture.md) §6 and a new record in [decisions/](decisions/)|
|A dependency, framework or runtime version changes|[technology.md](technology.md)|
|An authentication, authorization or data-handling rule changes|[security.md](security.md)|
|A new external service is integrated or removed|[integration.md](integration.md)|
|An API contract changes|[integration.md](integration.md)|
|The schema changes in a way that affects the domain model|[data-storage.md](data-storage.md)|
|An SLO, alert or runbook changes|[reliability.md](reliability.md), [observability.md](observability.md)|
|An incident post-mortem produces an action|The document that failed to prevent it|
|A CI gate is added or removed|[testing.md](testing.md)|
|A task is finished, or scope moves between phases|The phase file in [delivery/](delivery/), and [requirements.md §6.1](requirements.md#61-delivery-plan) if the phase's requirement range changed|
|A new **role or permission** appears|[requirements.md](requirements.md) §3 **and** [security.md](security.md) §2 — the two tables must agree, and a change to one without the other is the most common drift in this set|
|A new kind of **personal data** is collected, or a retention period changes|[security.md](security.md) §3 **and** [data-storage.md](data-storage.md) §4 **and** the published Privacy Policy|
|A **price or plan** changes|[requirements.md](requirements.md) §4.5 and the pricing pages|
|A **rate limit or quota** changes|[integration.md](integration.md) §6|
|A vendor is added, removed, or its data-processing scope changes|[integration.md](integration.md) §1, [security.md](security.md) §8 (sub-processor list), and the Privacy Policy|
|A legal document is amended, or a row in [legal-alignment.md](legal-alignment.md) is decided|The design document the decision lands in, **and** the legal-alignment row is closed and deleted|

The last four rows are additions to the template's list, and each was added for
the same reason: it is a change that looks purely technical and is actually a
change to a published promise.

**The rule:** the documentation change ships in the _same pull request_ as the
code change.

**How it is enforced.** A rule that depends only on reviewers remembering does
not survive its first deadline, so two pieces of automation back it up:

|Mechanism|What it does|
|-|-|
|[`tools/check-docs.py`](../tools/check-docs.py)|Fails the build on a broken link or a reference to a section that no longer exists — the most common symptom of a document drifting from reality|
|[`.github/workflows/docs.yml`](../.github/workflows/docs.yml)|Notices that code changed in an area owning a document while that document did not, and says so on the pull request|

The second is deliberately advisory rather than blocking. A gate that stops a
merge over documentation gets routed around within a month; a comment naming the
exact file usually gets acted on.

---

## 4. Style conventions

- **Language:** English, for every document in `docs/`, every commit message and
  every code identifier — see
  [glossary.md](glossary.md#language-conventions). The team talks in Russian and
  writes in English.
- **Format:** Markdown, one sentence per line where practical (produces readable
  diffs).
- **Headings:** numbered `##` sections, so they can be referenced as "§4".
  Section numbers and titles are stable — renaming one breaks every cross-link,
  which `tools/check-docs.py` will catch, but it is still churn nobody needs.
- **Links:** relative links between documents, so they work in the repository
  and in any rendered view. Link rather than duplicate — a fact written twice
  will be updated once.
- **Decisions:** always paired with rationale and the alternatives rejected.
- **Numbers:** specific and measurable. Not "fast", not "secure", not "soon".
  A requirement without a number cannot be failed, and therefore cannot be met.
- **Unknowns:** write `To be confirmed by launch owner` or `TBD — owner, date`, never a plausible
  guess. A guess that reads as fact is the most expensive kind of documentation
  error. Where a section genuinely does not apply, write
  `Not applicable — <reason>` rather than deleting it.
- **Diagrams:** ASCII inside fenced blocks for structure and sequence, so they
  diff cleanly and need no toolchain. Anything that outgrows ASCII goes to
  Mermaid, also in a fenced block. No binary image is ever the only copy of a
  diagram.
- **Dates:** ISO format, `YYYY-MM-DD`.
- **Emphasis:** `_underscores_` for italics, `**asterisks**` for bold — pinned in
  [`.markdownlint.json`](../.markdownlint.json) so the two never look alike in a
  diff.

---

## 5. Architecture decision records

Decision records live in [decisions/](decisions/); the process and the template
are documented there.

They deserve their own folder rather than a section in
[architecture.md](architecture.md#6-architectural-decisions) because they are a
different kind of writing. Everything else in `docs/` describes the system as it
is now, and therefore goes stale every time the system changes. A decision
record describes a moment — what was chosen, when, and why — and stays true
permanently, including after the decision is reversed.

**So: anything that can be written as a decision should be.** It costs the same
to write and nothing to maintain. `architecture.md` §6 keeps only a summary and
links out.

**A decision is recorded when** any of the following is true, per
[decisions/README.md](decisions/README.md): reversing it would cost more than a
week; the team disagreed or the discussion ran over an hour; a newcomer would be
surprised; or an obvious option was rejected. For this project two additional
triggers apply, because of what the product is: **anything that changes what
personal data we hold or who can see it**, and **anything that changes how money
becomes access**. Those two areas are where a future reader will most need to
know what we were thinking.

**Superseding:** mark the old record as superseded and link forward. Never
delete or silently edit a decision that was once true.

---

## 6. Review cadence

Triggers in §3 catch changes; reviews catch omissions.

|Document|Reviewed|Trigger|
|-|-|-|
|All of `docs/`|Quarterly|Scheduled — first Monday of the quarter, one hour, whole team|
|[security.md](security.md)|Quarterly|Also after any incident, any change to authentication or billing, and any new sub-processor|
|[reliability.md](reliability.md), [observability.md](observability.md)|Quarterly|Also after any incident, and after every alert review that changes an alert|
|[requirements.md](requirements.md)|Each phase boundary|Also whenever an assumption in §7 is proved or disproved|
|[brief.md](brief.md)|At each milestone|The success metric is either being met or it is not, and pretending otherwise is the point of failure|
|Runbooks|After any architecture change touching them, and after every use|A runbook is proved by being followed during an incident; that is when it gets corrected|
|[glossary.md](glossary.md)|Continuous, by trigger|No scheduled review needed — the trigger is enough|

**Review checklist:**

- [ ] Is every statement still true?
- [ ] Does anything contradict another document? (The known pairs to check:
      roles in requirements §3 vs. security §2; retention in security §3 vs.
      data-storage §4; SLOs in reliability §1 vs. alerts in observability §7)
- [ ] Are the `To be confirmed by launch owner` placeholders that remain still genuinely unknown?
- [ ] Have the empty "last tested" cells in
      [reliability.md §4](reliability.md#4-redundancy-and-failover) been filled?
- [ ] Does `python tools/check-docs.py --strict` pass with no warnings?
- [ ] Is the owner still on the project?
- [ ] Update the `Last updated` header — even if nothing else changed

---

## 7. Onboarding path

**Day one — understand the product:**

1. `README.md` — what this is
2. [brief.md](brief.md) — the problem and the one thing that could kill it
3. [requirements.md](requirements.md) — what it must do, and for whom
4. [architecture.md](architecture.md) §1–3 — the shape of the system

**Week one — become able to change it:**

5. [technology.md](technology.md) — the stack, and getting it running locally
6. [glossary.md](glossary.md) — so the first pull request uses the right words
7. [architecture.md](architecture.md) §4–7 — decisions and limitations
8. [data-storage.md](data-storage.md) — the domain model
9. [testing.md](testing.md) — how to prove a change is safe

**Before touching production:**

10. [security.md](security.md) — what must not leak
11. [reliability.md](reliability.md) — what must not break
12. [observability.md](observability.md) — how to see what is happening
13. [integration.md](integration.md) — what else is involved

**Read one thing before the rest, if you read nothing else:**
[decisions/0005-no-member-directory.md](decisions/0005-no-member-directory.md).
It is one page, and it explains the constraint that a newcomer is most likely to
violate by building something perfectly reasonable.

**Feedback loop:** a new joiner's first pull request should be a documentation
fix — the thing that confused them on day one. It is reported to the document's
owner, who fixes the document rather than only answering the question. A
question that `docs/` should have answered is a defect in `docs/`, and the new
joiner is the only person who will ever see it clearly.
