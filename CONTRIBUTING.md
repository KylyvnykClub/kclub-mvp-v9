# Contributing

> **Owner:** _(fill in)_
> **Last updated:** 2026-08-02
> **Write when:** before the first pull request.

How work gets from an idea into production here. The quality bar itself is in
[docs/testing.md](docs/testing.md#8-definition-of-done); this document covers
the human process around it.

---

## Getting set up

**Prerequisites** (see
[docs/technology.md §8](docs/technology.md#8-build-and-development-tooling)):

- Node.js 22 LTS — use the version in `.nvmrc`
- pnpm 10 — enabled through Corepack, not installed globally
- Docker Desktop — PostgreSQL 17, Redis, MinIO
- Stripe CLI — for forwarding test-mode webhooks to your machine
- 1Password CLI — for pulling sandbox credentials

```bash
git clone <repo> kclub && cd kclub
corepack enable
pnpm install

cp .env.example .env.local        # then fill it from the 1Password "KCLUB dev" item
pnpm services:up                  # PostgreSQL, Redis, MinIO in Docker
pnpm db:migrate                   # apply migrations
pnpm db:seed                      # categories, countries, cities, 20 fake partners, 3 members
pnpm dev                          # Next.js, the Inngest dev server and Stripe CLI forwarding
```

**Verify the setup works:**

```bash
pnpm verify                       # typecheck + lint + unit + integration. Must be green before you write anything
```

SMS codes are written to the terminal in development — no SMS is sent and
nothing is charged. Stripe runs in test mode; card `4242 4242 4242 4242` works
and `4000 0000 0000 0341` fails at renewal, which is the one you want for
testing dunning.

**Target: under 30 minutes from a clean machine.** Time it the next time you
onboard someone. Anything longer is a bug in this section, and fixing it is
worth more than it looks — it is paid back by every future joiner.

**Stuck?** Ask in the team chat. Then fix this document, because the next person
will be stuck in the same place.

---

## Branching

**Model:** trunk-based. `main` is always deployable; everything else is a
short-lived branch off it.

**Default branch:** `main`, protected. Required: one approving review (two for
`billing`, `identity` or `audit` — see below), all blocking CI gates green,
branch up to date with `main`. Nobody pushes directly, including the tech lead;
the protection rule is what makes that true rather than a habit.

**Branch naming:** `feat/short-description`, `fix/FR-014-card-reissue`,
`chore/…`, `docs/…`. Reference the FR where one exists — it is what connects a
branch to
[docs/requirements.md §4](docs/requirements.md#4-functional-requirements).

**Maximum branch age:** 3 days. Past that, rebase onto `main` daily or split the
work. A week-old branch is where merge conflicts and duplicated work come from,
and it is also where a large unreviewable pull request comes from.

Anything risky ships behind a feature flag rather than living on a branch —
exposure and deployment are separate events
([docs/reliability.md §8](docs/reliability.md#8-deployment-safety)).

---

## Commits

**Format:** Conventional Commits — `feat(billing): project entitlement from
subscription.updated`.

Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `chore`, `build`,
`ci`. Scopes are module names from
[docs/architecture.md §2](docs/architecture.md#2-components): `identity`,
`membership`, `catalogue`, `moderation`, `billing`, `referrals`,
`notifications`, `audit`, `platform`, `web`.

**Enforced by:** `commitlint` in a commit hook and again in CI. A convention is
worth adopting only if something checks it — otherwise half the history follows
it and the half that does not is the interesting half.

**Rules:**

- One logical change per commit; a commit that needs "and" in its subject is two
  commits.
- Reference the requirement or issue where one exists (`FR-014`, `#231`).
- Explain **why** in the body when the reason is not obvious from the diff. The
  diff already shows what changed.
- English, always ([docs/glossary.md](docs/glossary.md#language-conventions)).
- Never commit a secret. `gitleaks` runs pre-commit and in CI, but the first
  line of defence is not pasting one.

---

## Pull requests

**Before requesting review:**

- [ ] `pnpm verify` passes locally
- [ ] `python tools/check-docs.py` passes
- [ ] Self-reviewed the diff — read it as if someone else wrote it
- [ ] Description says **what** changed and **why**, and names the FR
- [ ] Failure paths are tested, not only the happy path
- [ ] Documentation updated if the change triggers a row in
      [docs/documentation.md §3](docs/documentation.md#3-update-triggers)
- [ ] Any new user-facing string exists in all three locales

**Size:** under ~400 changed lines, excluding lockfiles, generated code and
translation files. Beyond that, review quality collapses and approval becomes a
formality. A large pull request is usually two or three that were not separated
in time.

**Reviewers required:** one engineer. **Two** for anything touching `billing`,
`identity` or `audit`, and the second reviewer's job is specifically to ask
"what happens when this runs twice, out of order, or halfway".

**Review turnaround target:** within 4 working hours. A pull request waiting
overnight is a branch getting older, and branch age is the thing this process is
built to avoid.

**Who merges:** the author, after approval and green CI. The author is the
person who knows whether it is actually finished.

---

## Review standards

Reviewers check:

- **Correctness**, and whether the tests would catch it being wrong. "There is a
  test" is not the question; "would the test fail if this were broken" is.
- Whether it belongs where it was put
  ([docs/architecture.md](docs/architecture.md)) — particularly whether a module
  boundary was crossed by convenience
- Naming against [docs/glossary.md](docs/glossary.md)
- Security implications ([docs/security.md](docs/security.md))
- Documentation obligations from the trigger table

Four questions asked of every diff that touches the risky areas, because these
are this product's specific failure modes:

1. Does any new query or endpoint make one member's data reachable by another?
2. Is every externally triggered write idempotent, and is the key enforced by
   the database rather than by remembering?
3. Does every mutating staff action write an audit entry?
4. Does any new personal data have a retention period and a deletion path?

Reviewers do **not** debate formatting — the formatter decides. If it is not
automated and it keeps coming up in review, automate it.

**Comment convention:** mark non-blocking comments clearly (`nit:`), so the
author knows what actually blocks the merge. Blocking comments say what would
change your mind.

---

## Architectural changes

Before a change that would be expensive to reverse, open a decision record
first — see [docs/decisions/](docs/decisions/). It is far cheaper to disagree
about an approach in a one-page record than in a finished pull request.

For this project, two extra triggers apply beyond the usual ones: **anything
that changes what personal data we hold or who can see it**, and **anything that
changes how money becomes access**. Both get a record regardless of how small
the diff is.

---

## Releasing

**Cadence:** continuous to staging (every merge to `main`), on demand to
production — typically once or twice a week, and immediately for a fix.

**Versioning:** the deployment SHA is the version. There is no semantic version
because there is no consumer to communicate one to; the release identifier that
matters is the one in the logs, the traces and the deployment dashboard.

**Who approves a release:** the tech lead, after the staging smoke test.

**Release checklist:**

- [ ] Staging is running the candidate and its smoke test passed
- [ ] Any migration in the release is backward-compatible with the running
      production version
      ([docs/data-storage.md §3](docs/data-storage.md#3-schema-and-migrations))
- [ ] New alerts have runbooks
- [ ] Someone is available for the next two hours
- [ ] Post-deploy smoke test green, or rolled back
      ([docs/reliability.md §8](docs/reliability.md#8-deployment-safety))

**Freeze windows:** no deploys after 16:00 local on Friday, the day before a
public holiday, or during an active incident, without the owner's approval. The
reason is not superstition — the cost of a bad deploy is the time until someone
notices it.

---

## Reporting problems

|Type|Where|Who responds|
|-|-|-|
|Bug|GitHub issue, `bug` label, with severity per [docs/testing.md §9](docs/testing.md#9-regression-policy)|Tech lead triages within one working day|
|Production incident|`#incident` in team chat, and declare it — false alarms are free|Tech lead ([docs/reliability.md §7](docs/reliability.md#7-incident-process))|
|Feature request|GitHub issue, `feature` label|Client decides; scope lives in [docs/requirements.md](docs/requirements.md)|
|Security vulnerability|`security@kclub.com` — **not** a public issue ([docs/security.md §9](docs/security.md#9-incident-response))|Owner and tech lead, acknowledged within 3 working days|
|Privacy or data-subject request|`privacy@kclub.com`|Owner ([docs/security.md §8](docs/security.md#8-compliance))|
|Documentation gap|GitHub issue, `docs` label|The document's owner ([docs/documentation.md §2](docs/documentation.md#2-ownership))|

A documentation gap is a real defect. If you had to ask a question that `docs/`
should have answered, the fix is to update the document — not just to get your
answer.
