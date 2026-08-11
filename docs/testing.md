# Testing

> **Status:** In review
> **Owner:** KCLUB Delivery Lead
> **Last updated:** 2026-08-02
> **Write when:** before the first CI pipeline.

How we gain confidence that a change is safe to ship. The risks worth testing
are the ones identified across the other documents — particularly the failure
modes in [reliability.md](reliability.md#3-failure-modes) and the controls in
[security.md](security.md).

---

## 1. Strategy

The test suite exists so that three engineers can change a system handling other
people's money and other people's privacy, on a Tuesday afternoon, without
asking anyone's permission.

Three kinds of bug would hurt disproportionately here, and the suite is shaped
around them rather than around a coverage number:

1. **A member sees another member.** The product's single promise. A leak is not
   a bug to be fixed in the next release; it is the end of the club's premise.
2. **Money and access disagree.** Charged and not granted, granted and not
   charged, charged twice, or access that outlives the payment. These are
   unrecoverable in the sense that matters: the member's trust does not come
   back with the refund.
3. **Something silently stops.** A webhook not projected, an outbox not drained,
   a job that fails identically every night. Nothing errors; the club just
   quietly stops working for the people who paid most recently.

Everything else — a broken layout, a mistranslated label, a slow page — is
embarrassing and recoverable. It gets tested; it does not get the same
investment.

**Test pyramid (target distribution):**

```text
        ╱╲          e2e         ~25 specs — the four flows in ux.md §3, per role
       ╱──╲
      ╱    ╲        integration ~40% of the suite — real PostgreSQL, real Redis,
     ╱──────╲                    Stripe test clocks. Where the real bugs are
    ╱        ╲      unit        ~55% — domain rules, money, quotas, state machines
   ╱──────────╲
```

The shape is deliberately integration-heavy for a web application. The
interesting logic here is not in pure functions — it is in what happens when a
webhook arrives twice, when two moderators click approve at the same moment, or
when a subscription lapses during a grace period. None of that is observable
without a real database, and a mock of PostgreSQL's uniqueness constraint proves
only that the mock behaves as we imagined.

---

## 2. Test levels

|Level|Covers|May use|Must not|Speed target|
|-|-|-|-|-|
|Unit|A single domain function or React component: entitlement rules, quota arithmetic, state transitions, money formatting, permission checks, Zod schemas|In-memory fakes|Network, database, filesystem, real time, real randomness|< 50 ms each; whole unit suite < 30 s|
|Integration|A use case end to end through the real data layer: repositories, transactions, outbox, webhook handlers, jobs|Real PostgreSQL (Testcontainers), real Redis, Stripe test mode + test clocks, local Inngest|Twilio (mocked at the SDK), Resend, any live third party except Stripe test mode|< 2 s each; whole suite < 5 min|
|End-to-end|The four critical flows in [ux.md §3](ux.md#3-key-user-flows), each per relevant role, in a real browser against a preview deployment|The deployed preview, sandbox vendors, a seeded database|Production, real SMS, real charges|< 30 s each; whole suite < 10 min|
|Visual regression|The card, the catalogue, the partner page, the four-step form — in both themes and all three locales|Playwright screenshots against committed baselines|—|Included in the e2e run|
|Accessibility|Every screen in [ux.md §2](ux.md#2-screen-inventory) via axe; keyboard-only traversal of the four flows|The e2e harness|—|Included in the e2e run|
|Contract|Not applicable to an internal API — the TypeScript compiler is the contract check. Applies only to the four public REST endpoints, whose Zod schemas generate the OpenAPI document and are asserted against recorded fixtures|—|—|Seconds|
|Load|The catalogue, sign-in and card verification at 10× projected launch traffic|k6 against staging with 10× synthetic data|Production|Run before launch and quarterly|

**Tooling:** Vitest (unit and integration), Testcontainers (PostgreSQL, Redis,
MinIO), Playwright (e2e, visual, accessibility), axe-core, k6, Stripe CLI and
test clocks, MSW for HTTP mocking at the network boundary rather than by
monkey-patching modules. See
[technology.md §8](technology.md#8-build-and-development-tooling).

---

## 3. What must be tested

Derived from the **M** requirements in
[requirements.md §4](requirements.md#4-functional-requirements) and the critical
paths in [reliability.md §2](reliability.md#2-critical-paths). Every test file
names the FR it covers, so an untested requirement is greppable.

|Area|Level|Why it matters|
|-|-|-|
|**No endpoint returns a set of members**|Integration, exhaustive|The product promise. A generated test walks every route and every Server Action as `guest`, as a member, and as a second member, and asserts no response body contains another member's identifier. This test is the reason [decisions/0005](decisions/0005-no-member-directory.md) is enforceable rather than aspirational|
|Object-level authorization|Integration, exhaustive|Every route replayed with a second member's ids: company, subscription, referral, card. Assert 403 or 404, never data|
|Role matrix|Integration|Each staff role against each console action, asserting the table in [security.md §2](security.md#2-authentication-and-authorization) exactly. A new action with no row in the matrix fails the test|
|Stripe webhook idempotency|Integration|Same event delivered 3×, out of order, and interleaved with a competing event, asserting one entitlement and no duplicate side effects|
|Subscription lifecycle|Integration, with test clocks|Subscribe → renew → fail → dun → recover → cancel → lapse. Assert access at every step, including that a cancellation retains access until period end (FR-054) and that a lapse unpublishes a company (FR-055)|
|Entitlement projection is a fold, not a delta|Integration|Replaying every event in a random order converges on the same state. This is the property that makes out-of-order delivery safe|
|Reconciliation|Integration|Deliberately corrupt local state, run the job, assert repair and alert|
|Phone verification|Integration|Code expiry, attempt exhaustion, cooldown, per-number and per-IP limits, and that no code is ever persisted|
|Referral quotas|Integration|10/day and 3/day/pair, at the boundary, concurrently (two simultaneous sends at the limit must not both succeed), and with Redis unavailable|
|Referral data lifecycle|Integration|Contact details deleted on decline, expiry and rejection; hidden until acceptance; present in an export only for the right party|
|Card verification disclosure|Integration|Assert on the **response body**, not the rendered page: valid, revoked and unknown tokens produce responses of the same shape, and no field beyond FR-023 appears|
|QR token invalidation|Integration|Reissue invalidates the old token immediately; revocation is not cached|
|Company publication gates|Integration|`approved ∧ listing_active`, in every combination, including the two that must not publish|
|Audit completeness|Integration|Every mutating console action produces exactly one audit entry with actor, target and before/after; and the application's database role cannot `UPDATE` or `DELETE` the table|
|Log redaction|Integration|A request carrying every secret field produces no log line containing any of them ([security.md §3](security.md#3-data-protection))|
|Money arithmetic|Unit|Integer minor units throughout; proration, grace period boundaries, currency formatting per locale. No floating point reaches an amount|
|Localisation completeness|Unit / CI|Every key present in all three locales; no hard-coded user-facing string; ICU plural categories correct for Russian and Ukrainian|
|Migration reversibility|CI|Up → down → up on a fresh branch database, every migration, every pull request|
|Accessibility of the four flows|e2e|Keyboard-only completion, axe with no serious or critical violations|
|Performance budgets|CI|Bundle size and Lighthouse against the numbers in [ux.md §10](ux.md#10-performance-as-experienced)|

**Deliberately not tested, and why:**

- **Vendor behaviour we do not control** — that Stripe charges a card, that
  Twilio delivers an SMS. We test our handling of their responses, including the
  failures. Testing their product is testing someone else's system.
- **The marketing site's copy and layout beyond visual regression.** It changes
  often, breaks visibly, and costs little when wrong.
- **The staff console's read-only screens beyond a smoke test.** They are
  reporting surfaces over data whose correctness is tested where it is written.
- **Browser matrix beyond Chromium and WebKit in CI.** Firefox and Edge are
  checked manually per release. Running four browsers on every pull request buys
  little at this product's complexity.
- **Load testing anything but the three hot paths.** Everything else is either
  staff-only or low-volume.

Each of these is a decision, so that a gap is not later mistaken for an
oversight.

---

## 4. Coverage

|Scope|Target|Enforced|
|-|-|-|
|Overall (lines)|70%|Warn; a drop of more than 2 points from `main` fails the build|
|`src/domain/**` (entitlements, quotas, permissions, state machines)|90% branches|**Fails the build**|
|`src/data/**` (repositories, transactions, outbox)|85% lines|Fails the build|
|Webhook handlers and jobs|90% lines|Fails the build|
|UI components|No target|—|
|Excluded from measurement|Generated code, migrations, `messages/*.json`, configuration, Storybook stories|—|

Coverage measures which lines ran, not whether anything was verified — a suite
can reach 90% while asserting nothing. The overall number is therefore a signal
to look, not a gate. The three gated directories are gated because they are
where a missed branch is a missed payment or a missed permission check, and
because in those files a line that never runs in a test is a line nobody has
thought about.

---

## 5. Test data and environments

|Aspect|Approach|
|-|-|
|Fixtures / factories|Typed factories per entity with sensible defaults and explicit overrides (`aMember({ tier: 'vip' })`). Every test states only the fields it cares about, so a schema change breaks the factory rather than four hundred tests|
|Database per test run|One PostgreSQL container per CI job, one schema per worker; preview environments get a Neon branch created from the schema|
|Isolation between tests|Each test runs in a transaction that is rolled back afterwards. Tests that must commit (outbox dispatch, `SKIP LOCKED` behaviour) truncate their tables instead and are marked serial|
|Parallel execution|Yes, one worker per core, one schema each. A test that fails only in parallel is a test that shares state, and that is a bug in the test|
|Time and randomness|Both injected. A clock is a dependency, never `Date.now()` in domain code; UUIDs and tokens come from an injectable source. Every test is deterministic — a suite that fails one run in fifty is a suite people learn to re-run|
|Timezones|CI runs the suite twice: once in UTC and once in `Pacific/Auckland`. A billing boundary bug that only appears across the date line is otherwise found by a member in New Zealand|
|Production data in tests|**Forbidden**, without exception ([data-storage.md §9](data-storage.md#9-data-access)). Seed data is generated, including realistic Cyrillic and Ukrainian names, long strings, and emoji — the inputs that break layouts|

**External services in tests:** Stripe runs in real test mode with test clocks
(the whole point of choosing it); Twilio, Resend and R2 are mocked at the network
boundary with MSW in integration tests and are sandboxed in staging. Details in
[integration.md §8](integration.md#8-testing-integrations).

---

## 6. CI gates

|Check|When|Blocks merge|
|-|-|-|
|Lint and format|Every push|Yes|
|Type check (`tsc --noEmit`)|Every push|Yes|
|Unit tests|Every push|Yes|
|Integration tests|Every push|Yes|
|Migration up/down/up|Every push touching `db/`|Yes|
|Authorization and member-leak suites|Every push|Yes|
|Localisation completeness|Every push|Yes|
|Secret scan (`gitleaks`)|Every push|Yes|
|Dependency audit (moderate and above)|Every push|Yes|
|CodeQL|Every push|Yes|
|Build succeeds|Every push|Yes|
|Bundle size budget|Every push|Yes|
|End-to-end tests against the preview|On pull request, after deploy|Yes|
|Accessibility (axe, keyboard)|With e2e|Yes|
|Visual regression|With e2e|No — reports a diff for a human to approve|
|Lighthouse budgets|With e2e|No — warns; reviewed weekly|
|`python tools/check-docs.py --strict`|Every push|No — comments on the pull request|
|Documentation trigger check|Every push|No — comments, per [documentation.md §3](documentation.md#3-update-triggers)|
|Load test|Manually, and before a release with schema or query changes|No|

**Target pipeline duration:** under 10 minutes to the first blocking result,
under 15 minutes total. Past twenty minutes people start batching changes to
avoid the wait, which produces exactly the large pull requests the process is
meant to prevent.

**Flaky test policy:** a test that fails intermittently is quarantined the same
day — moved to a `flaky` tag that still runs and reports but does not block —
with an issue, an owner and a 7-day deadline. After 7 days it is fixed or
deleted. Retrying until green is forbidden, and the CI configuration has no
retry option enabled, because a retry is a decision to ignore a failure taken
once and applied forever.

---

## 7. Manual and specialist testing

|Activity|When|Who|Note|
|-|-|-|-|
|Exploratory testing|Every release, 30 minutes, against staging|Whoever did not write the feature|Freeform, with a written note of anything surprising|
|"Fresh phone" test|Every release|Anyone|Register as a brand-new member on a real phone with real SMS in staging. Automation cannot tell you the SMS took 40 seconds and the copy was confusing|
|Accessibility check|Every release|Tech lead / AI|Keyboard-only, VoiceOver, 200% zoom, both themes ([ux.md §8](ux.md#8-accessibility))|
|Cross-browser / device|Every release|Tech lead|Firefox and Edge on desktop; a real iPhone and a real mid-range Android. QR scanning is verified on a real camera every time — it is the one interaction no emulator proves|
|Localisation review|When strings change|Accepted Gap|Solo dev relies on machine translation. Must be resolved by native speakers before Phase 2 ends ([ux.md §9](ux.md#9-content-and-tone))|
|Performance / load test|Before launch, then quarterly and before any release changing schema or hot queries|Tech lead|Against [requirements.md §5.1](requirements.md#51-performance)|
|Security testing|Before launch, then annually and after any auth or billing change|Third party|[security.md §10](security.md#10-security-testing)|
|Restore / failover drill|Quarterly|Tech lead|[reliability.md §6](reliability.md#6-backup-and-restore)|
|Incident tabletop|Before launch, twice a year|Whole team|The three scenarios in [security.md §9](security.md#9-incident-response)|
|Moderation dry-run|Before phase 2 ends|Client + moderator|Fifty real applications through the queue, to find out whether the reject reasons are the right ones before they are set in the interface|

---

## 8. Definition of Done

A change is done when:

- [ ] The requirement it implements is identified (FR-xxx) and satisfied
- [ ] Tests cover the new behaviour at the appropriate level, and the test names
      reference the FR
- [ ] The failure paths are tested, not only the happy path — at minimum: not
      authorised, not found, invalid input, and the dependency being unavailable
- [ ] All blocking CI gates pass
- [ ] If it touches money, identity or another person's data: a second reviewer,
      and a note in the pull request explaining what could go wrong and why it
      cannot
- [ ] If it adds a user-facing string: present in all three locales
- [ ] If it adds a mutating staff action: it writes an audit entry, and there is
      a test proving it
- [ ] If it adds an alert: the runbook exists
- [ ] Documentation in `docs/` is updated if the change affects it — see
      [documentation.md §3](documentation.md#3-update-triggers)
- [ ] Reviewed and approved by AI Reviewer (`/code-review`, `/reflect`); acting as the second reviewer for anything in `billing`, `identity` or `audit`
- [ ] Self-reviewed: the author has read their own diff as if it were someone
      else's

This list is honest rather than aspirational. Every item is either enforced by
CI or genuinely checked in review; nothing is here because it sounds
responsible.

---

## 9. Regression policy

**Rule:** every production bug gets a test that fails before the fix and passes
after it, in the same pull request. No exceptions for urgency — if there is time
to fix it there is time to write the test that proves it is fixed, and the fix
made in a hurry is precisely the one that comes back.

The only exception is a bug whose reproduction requires production data or
production-only vendor behaviour. In that case the pull request states what
would have to exist to test it, and the tech lead approves the gap explicitly.

**Bug triage:**

|Severity|Definition|Response|
|-|-|-|
|S1|Data leak, money incorrect, or a critical path down|Fix now, out of band, any hour. Post-mortem required|
|S2|A critical path degraded, or a member blocked from something they paid for|Fix within 2 business days|
|S3|A feature is wrong but has a workaround|Next planned release|
|S4|Cosmetic, or affects an internal-only surface|Backlog, reviewed monthly|

Severity is decided by the tech lead with the client for anything touching
money or privacy. The person who found it does not get to set it, and neither
does the person who wrote it.
