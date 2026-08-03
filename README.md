# KCLUB — KYLYVNYK CLUB

A closed international business club, delivered as a web application.

Verified members hold a digital membership card and get access to a catalogue of
vetted partner businesses that offer them a discount. Members who own a business
can pass warm client referrals to other member businesses. Everything is
moderated, nothing about a member is public, and there is no member directory —
by design, not by omission.

**Status:** design complete, phase 0 in progress. This repository currently
contains the documentation set and the delivery plan; there is no application
code yet. Start with [docs/brief.md](docs/brief.md), then
[docs/requirements.md](docs/requirements.md). What is being built right now is in
[docs/delivery/phase-0.md](docs/delivery/phase-0.md).

---

## The shape of it in ten lines

- One Next.js 15 application on Vercel — marketing site, member area, staff
  console and card verification in a single deployment, organised as a modular
  monolith ([ADR 0001](docs/decisions/0001-nextjs-monolith-on-vercel.md))
- PostgreSQL 17 on Neon as the only datastore, through Drizzle
  ([ADR 0002](docs/decisions/0002-postgresql-on-neon-with-drizzle.md))
- Self-hosted phone authentication; SMS codes from Twilio Verify
  ([ADR 0003](docs/decisions/0003-self-hosted-phone-authentication.md))
- Stripe Billing as the system of record; entitlements projected from webhooks,
  never from a redirect
  ([ADR 0004](docs/decisions/0004-stripe-billing-as-system-of-record.md))
- Background work on Inngest, fed by a transactional outbox
  ([ADR 0008](docs/decisions/0008-durable-background-jobs-with-inngest.md))
- Three languages (en/ru/uk), light and dark themes, mobile-first, WCAG 2.1 AA

Two products, both $19.99/month: VIP membership and a partner catalogue listing.

---

## The three constraints that shape everything

Read these before proposing a feature. Each has cost real design decisions, and
each is the thing a newcomer is most likely to violate while building something
perfectly reasonable.

1. **No member is ever disclosed to another member.** There is no member
   directory, no people search, no member-to-member messaging. The data layer
   has no function that returns a collection of members to a member-scoped
   actor, and a generated test walks the whole route table proving it.
   ([ADR 0005](docs/decisions/0005-no-member-directory.md))
2. **Money and access must never disagree.** Entitlements come only from Stripe
   webhooks, projected as a fold over state, reconciled nightly. A return from
   the checkout redirect grants nothing.
   ([ADR 0004](docs/decisions/0004-stripe-billing-as-system-of-record.md))
3. **This is not MLM, structurally.** No referral codes, no downline, no
   commission, no invite quotas. Referrals are client introductions between
   businesses, with recorded consent and a hard quota.
   ([ADR 0009](docs/decisions/0009-referral-data-minimisation.md))

---

## Running it locally

_(Not yet applicable — there is no application code. This section is filled in
during phase 0; the target is under 30 minutes from a clean machine, and
anything longer is a bug worth fixing. See
[CONTRIBUTING.md](CONTRIBUTING.md#getting-set-up).)_

Prerequisites will be: Node.js 22 LTS, pnpm 10, Docker (PostgreSQL, Redis,
MinIO), and the Stripe CLI.

---

## Documentation

Everything about this project that is worth knowing is in `docs/`. Each document
says at the top when it should be written and who owns it.

**Before the first line of code**

|File|Answers the question|
|-|-|
|[docs/brief.md](docs/brief.md)|What problem, for whom, and what are we not doing?|
|[docs/decisions/](docs/decisions/)|Why is anything the way it is?|
|[CLAUDE.md](CLAUDE.md)|What must be known before touching this repository, and where does each answer live?|

**Once the work outlives a prototype**

|File|Answers the question|
|-|-|
|[docs/requirements.md](docs/requirements.md)|What must it do, and when is it done?|
|[docs/delivery/](docs/delivery/)|What is being built now, in what order, and what closes a phase?|
|[docs/technology.md](docs/technology.md)|Which technologies, and why these?|
|[docs/architecture.md](docs/architecture.md)|How is the system structured?|
|[docs/ux.md](docs/ux.md)|What does the user see, and what happens when it fails?|
|[docs/glossary.md](docs/glossary.md)|What do we call things — in code, in the UI, in the database, in three languages?|
|[docs/data-storage.md](docs/data-storage.md)|Where does data live, and how is it kept safe?|
|[docs/testing.md](docs/testing.md)|How do we know a change is safe to ship?|
|[docs/legal-alignment.md](docs/legal-alignment.md)|Where do the executed legal documents and this design disagree, and who decides?|
|[CONTRIBUTING.md](CONTRIBUTING.md)|How does work get merged and released?|

**Before the first production deploy**

|File|Answers the question|
|-|-|
|[docs/security.md](docs/security.md)|What are we protecting, from whom, and how?|
|[docs/reliability.md](docs/reliability.md)|What happens when something breaks?|
|[docs/observability.md](docs/observability.md)|How do we know the system is healthy?|
|[docs/integration.md](docs/integration.md)|What do we talk to, and what is the contract?|

**When more than one person maintains the documentation**

|File|Answers the question|
|-|-|
|[docs/documentation.md](docs/documentation.md)|How do we keep all of the above true?|

**New here?** The reading order is in
[docs/documentation.md §7](docs/documentation.md#7-onboarding-path). If you read
only one page first, read
[ADR 0005](docs/decisions/0005-no-member-directory.md) — it is short, and it
explains the constraint most easily broken by accident.

---

## Two ideas the documentation is built on

**Records outlive descriptions.** A description of the system ("the API is
REST") becomes false the day the system changes, and needs maintaining forever.
A decision record ("in August 2026 we chose a monolith over services,
because …") stays true permanently — even after the decision is reversed, at
which point you add a new record and mark the old one superseded. So anything
that can be written as a decision is written as a decision: same cost to write,
no cost to maintain. That is what [docs/decisions/](docs/decisions/) is for, and
why `architecture.md` §6 is only an index.

**Prose is for _why_, not _what_.** Anything derivable from the code — the API
schema, environment variables, the database schema, the dependency list — should
be generated, not written. If `grep` can answer it, it does not belong in
`docs/`. What no tool can recover is the reasoning: the constraints, the
rejected options, the thing you knowingly accepted.

---

## Conventions used in every document

**Header.** Every document starts with:

```markdown
> **Status:** Draft | In review | Approved
> **Owner:** _(who keeps this document accurate)_
> **Last updated:** _(YYYY-MM-DD)_
> **Write when:** _(the trigger that makes this document worth writing)_
```

A document with no owner will not be maintained. Name a person, not a team.
**Owners are currently unassigned** — that is a kick-off task, and
`tools/check-docs.py` warns about it on every run so it cannot be quietly
skipped.

**Placeholders.** `_(fill in)_` marks something that must be replaced. Where a
value is genuinely unknown it stays unfilled rather than guessed — a plausible
guess that reads as fact is the most expensive kind of documentation error.

**Decision + rationale.** Wherever a choice is recorded, so is why, and what was
rejected. The rationale is the part that ages well; in two years nobody will
remember why the obvious option was wrong, and the team will re-argue it from
scratch.

---

## Keeping the documentation true

Documentation that contradicts the code is worse than none, because it is
trusted. A rule that depends on everyone remembering does not survive its first
deadline, so the process is backed by tooling:

```bash
python tools/check-docs.py          # broken links, missing owners, stale dates
python tools/check-docs.py --strict # fail on warnings too — use in CI
```

|Mechanism|What it does|
|-|-|
|[tools/check-docs.py](tools/check-docs.py)|Fails on broken links and references to sections that no longer exist|
|[.github/workflows/docs.yml](.github/workflows/docs.yml)|Flags a pull request that changes code owning a document without touching it|
|[.github/CODEOWNERS](.github/CODEOWNERS)|Adds a document's owner as a reviewer automatically|
|[.markdownlint.json](.markdownlint.json)|Pins the formatting rules so linting does not depend on each editor|

The trigger table in
[docs/documentation.md §3](docs/documentation.md#3-update-triggers) lists which
change obliges which document to be updated. The rule: **the documentation
change ships in the same pull request as the code change.**

The CI reminder is advisory rather than blocking, deliberately. A gate that
stops a merge over documentation gets routed around within a month; a comment
naming the exact file usually gets acted on.
