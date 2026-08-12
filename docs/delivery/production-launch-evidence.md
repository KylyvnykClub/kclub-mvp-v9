# Production Launch Evidence

> **Status:** Draft
> **Owner:** KCLUB Delivery Lead
> **Last updated:** 2026-08-12
> **Write when:** continuously from private-beta hardening until production promotion.

This is the production launch ledger. It converts
[`requirements.md §8`](../requirements.md#8-acceptance-criteria) into an
evidence table that can be closed one line at a time. A row is not complete
because a document says it should be; it is complete only when the Evidence
column points to a passing run, vendor dashboard confirmation, rehearsal record,
or reviewed artifact.

## Status Values

|Status|Meaning|
|-|-|
|`blocked`|Cannot be completed without external provisioning, client decision, vendor approval, or missing product work.|
|`in_progress`|Code or documentation exists, but launch evidence is incomplete.|
|`ready_for_rehearsal`|The repo has the tools/docs needed; the remaining work is to run it against preview, staging, or production.|
|`complete`|Evidence is linked and the acceptance criterion can be treated as satisfied for launch.|

## Acceptance Ledger

|ID|Acceptance criterion|Status|Current evidence|Missing evidence / next action|
|-|-|-|-|-|
|`AC-01`|All **M** functional requirements implemented, each with an automated test referencing its FR ID.|`blocked`|`python tools/check-plan.py --strict` currently passes, and the unit/integration suites run locally.|Confirm every M requirement is implemented in the live product, not only claimed by a task. Keep `check-plan.py --strict` green after each implementation PR.|
|`AC-02`|Non-functional targets in §5 measured and met, with the measurement recorded.|`blocked`|Reliability and performance targets are documented in [requirements.md §5](../requirements.md#5-non-functional-requirements) and [reliability.md](../reliability.md).|Run and attach load, latency, availability, SMS delivery, and entitlement freshness measurements.|
|`AC-03`|Full billing lifecycle verified against Stripe test clocks: subscribe, renew, fail, recover, cancel, lapse, duplicate and out-of-order webhooks.|`blocked`|Billing projection integration tests exist; production env checklist names Stripe keys, prices, webhook, and lifecycle proof.|Run Stripe test-clock lifecycle evidence end to end and attach CI or staging results.|
|`AC-04`|Card verification discloses nothing beyond FR-023, confirmed by reviewing the actual HTTP response body.|`in_progress`|Card token hashing tests are present; `identity-card-tokens.integration.test.ts` asserts the public verification DTO exposes only FR-023 fields, and the public route exists at `/[locale]/card/[token]`.|Capture valid, revoked, and unknown token HTTP responses from preview and review the raw bodies before marking complete.|
|`AC-05`|No endpoint returns a set of members to any member-level role, confirmed by an automated test over the whole route table.|`ready_for_rehearsal`|Constraint suites include route/member leak tests, RBAC tests, and `route-registry-coverage.test.ts`, which compares `src/app` production routes to `src/domain/route-registry.ts`.|Run the constraint suite in CI after merge and attach the run before marking complete.|
|`AC-06`|WCAG 2.1 AA audit passed on the ten screens in `ux.md §2`, keyboard-only and with a screen reader.|`blocked`|Design/accessibility expectations exist in [ux.md](../ux.md).|Run the ten-screen audit on preview, including keyboard-only and screen reader notes.|
|`AC-07`|All three locales complete, with no untranslated string in any supported language, enforced in CI.|`in_progress`|`pnpm i18n:check` passes locally with 542 keys across English, Russian, and Ukrainian.|Run the same check in CI after merge and smoke the visible screens for untranslated hardcoded strings.|
|`AC-08`|Penetration test completed and all high and critical findings closed.|`blocked`|Security controls and threat model are documented in [security.md](../security.md).|Schedule the external or adversarial pre-launch test and attach the report/closure evidence.|
|`AC-09`|Restore drill completed from a production backup, with elapsed time recorded in `reliability.md §6`.|`ready_for_rehearsal`|Restore runbook exists at [docs/runbooks/restore.md](../runbooks/restore.md).|Run a restore drill from a production-like backup or Neon branch, record RTO/RPO and elapsed time in [reliability.md §6](../reliability.md#6-backup-and-restore).|
|`AC-10`|Runbooks exist for every paging alert.|`ready_for_rehearsal`|Runbook pack exists under [docs/runbooks/](../runbooks/site-down.md), and [observability.md §9](../observability.md#9-runbooks) links every paging alert to a file.|Rehearse the paging runbooks on staging or tabletop; record any corrections before marking complete.|
|`AC-11`|Legal pages published and versioned, and their acceptance recorded at registration.|`in_progress`|Legal content exists under `content/legal/` and generated policy docs exist under `docs/policy/`; registration has legal consent plumbing.|Verify production legal URLs, exact versions, registration acceptance records, and legal-alignment conflicts before launch.|
|`AC-12`|A2P 10DLC campaign approved and production SMS sending verified.|`blocked`|Twilio keys and external checks are listed in [production-env-readiness.md](production-env-readiness.md#sms-twilio-verify).|Obtain A2P 10DLC approval, confirm Fraud Guard/spend caps/geographic permissions, and run a production SMS smoke to an allowlisted owner phone.|

## Baseline Commands

These commands are necessary evidence for code health, but they do not by
themselves close the production launch criteria:

```powershell
pnpm verify
pnpm build
pnpm test:integration
pnpm db:updownup
python tools/check-plan.py --strict
python tools/check-docs.py --strict
git diff --check
```

## Deployment Evidence Commands

Run these against preview or production once the environment exists:

```powershell
pnpm smoke:deployment https://preview-or-production-url
```

Record the URL, commit SHA, timestamp, and result in this ledger or in a linked
handoff before marking any preview or production smoke row complete.
