# Production Launch Evidence

> **Status:** Draft
> **Owner:** KCLUB Delivery Lead
> **Last updated:** 2026-08-19
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
|`deferred`|The product decision it tested has been postponed, so it is not a launch blocker. The row stays, with the decision record that moved it, and returns to `blocked` if the decision is reversed.|

## Acceptance Ledger

|ID|Acceptance criterion|Status|Current evidence|Missing evidence / next action|
|-|-|-|-|-|
|`AC-01`|All **M** functional requirements implemented, each with an automated test referencing its FR ID.|`blocked`|Every M requirement now has a written decision behind it: implemented and tested, or a named, dated gap. The single unresolved M requirement is FR-006 (password reset), deliberately unbuilt pending the client's answer to `requirements.md §9` ([ADR 0015](../decisions/0015-password-reset-deferred-to-client.md)). `python tools/check-plan.py --strict` passes, and the unit/integration suites run locally.|Genuinely blocked, not a coverage gap: cannot close until the client answers the account-recovery question. Keep `check-plan.py --strict` green after each implementation PR.|
|`AC-02`|Non-functional targets in §5 measured and met, with the measurement recorded.|`blocked`|Reliability and performance targets are documented in [requirements.md §5](../requirements.md#5-non-functional-requirements) and [reliability.md](../reliability.md).|Run and attach load, latency, availability, SMS delivery, and entitlement freshness measurements.|
|`AC-03`|Full billing lifecycle verified against Stripe test clocks: subscribe, renew, fail, recover, cancel, lapse, duplicate and out-of-order webhooks.|`blocked`|Billing projection integration tests exist; production env checklist names Stripe keys, prices, webhook, and lifecycle proof.|Run Stripe test-clock lifecycle evidence end to end and attach CI or staging results.|
|`AC-04`|Card verification discloses nothing beyond FR-023, confirmed by reviewing the actual HTTP response body.|`in_progress`|Card token hashing tests are present; `identity-card-tokens.integration.test.ts` asserts the public verification DTO exposes only FR-023 fields, and the public route exists at `/[locale]/card/[token]`.|Capture valid, revoked, and unknown token HTTP responses from preview and review the raw bodies before marking complete.|
|`AC-05`|No endpoint returns a set of members to any member-level role, confirmed by an automated test over the whole route table.|`ready_for_rehearsal`|Constraint suites include route/member leak tests, RBAC tests, and `route-registry-coverage.test.ts`, which compares `src/app` production routes to `src/domain/route-registry.ts`.|Run the constraint suite in CI after merge and attach the run before marking complete.|
|`AC-06`|WCAG 2.1 AA audit passed on the ten screens in `ux.md §2`, keyboard-only and with a screen reader.|`blocked`|Design/accessibility expectations exist in [ux.md](../ux.md).|Run the ten-screen audit on preview, including keyboard-only and screen reader notes.|
|`AC-07`|All three locales complete, with no untranslated string in any supported language, enforced in CI.|`ready_for_rehearsal`|`pnpm i18n:check` passes locally, `src/i18n/i18n.test.ts` now rejects mojibake/replacement placeholder corruption across `messages/{en,ru,uk}.json`, and the remaining hardcoded TOTP/directory labels were moved into localized message keys.|Run the same checks in CI after merge and smoke the visible screens for untranslated hardcoded strings before marking complete.|
|`AC-08`|Penetration test completed and all high and critical findings closed.|`blocked`|Security controls and threat model are documented in [security.md](../security.md).|Schedule the external or adversarial pre-launch test and attach the report/closure evidence.|
|`AC-09`|Restore drill completed from a production backup, with elapsed time recorded in `reliability.md §6`.|`ready_for_rehearsal`|Restore runbook exists at [docs/runbooks/restore.md](../runbooks/restore.md).|Run a restore drill from a production-like backup or Neon branch, record RTO/RPO and elapsed time in [reliability.md §6](../reliability.md#6-backup-and-restore).|
|`AC-10`|Runbooks exist for every paging alert.|`ready_for_rehearsal`|Runbook pack exists under [docs/runbooks/](../runbooks/site-down.md), and [observability.md §9](../observability.md#9-runbooks) links every paging alert to a file.|Rehearse the paging runbooks on staging or tabletop; record any corrections before marking complete.|
|`AC-11`|Legal pages published and versioned, and their acceptance recorded at registration.|`ready_for_rehearsal`|Nine approved Russian source documents were retrieved from the shared Google Drive legal folder, regenerated as clean non-authoritative RU MDX, and translated into authoritative `{id}.en.mdx` files. Registration already records consent versions for Terms, Privacy, arbitration, and age attestation, and `tests/constraints/legal-documents.test.ts` covers authoritative EN files plus mojibake/Word-metadata hygiene.|Verify production legal URLs, exact versions, and registration acceptance records on preview/production before marking complete.|
|`AC-12`|Production SMS delivery verified end to end through Twilio Verify.|`deferred`|Phone verification was postponed on 2026-08-15 ([ADR 0012](../decisions/0012-postpone-phone-verification-turnstile-gate.md)): registration no longer requests, sends or checks an SMS code, and `AUTH_PHONE_VERIFICATION_ENABLED` is `false`. Earlier context: A2P 10DLC registration was dropped as inapplicable ([ADR 0010](../decisions/0010-no-own-a2p-registration-with-twilio-verify.md)).|Nothing, while the postponement stands. **Replaced for launch by `AC-13`.** If the flag is turned back on, this row returns to `blocked` and the Twilio checks in [production-env-readiness.md](production-env-readiness.md#sms-twilio-verify-postponed) apply again.|
|`AC-13`|Registration is protected from automated account creation by Cloudflare Turnstile, verified against production.|`blocked`|Turnstile is implemented and verified server-side in `verifyTurnstileToken`, fails closed when Cloudflare is unreachable, and `src/env.schema.ts` refuses to boot production without `TURNSTILE_SECRET_KEY` while phone verification is off ([ADR 0012](../decisions/0012-postpone-phone-verification-turnstile-gate.md)). Unit coverage in `src/modules/identity/turnstile.test.ts`.|Provision the Turnstile site, set both keys in production, then confirm on the production domain that the challenge renders in all three locales and that a registration attempt without a solved challenge is refused.|

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
