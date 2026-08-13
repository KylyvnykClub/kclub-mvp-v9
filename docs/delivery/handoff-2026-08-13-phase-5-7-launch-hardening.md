# Handoff: Phase 5-7 Launch Hardening

> **Status:** Active handoff
> **Owner:** KCLUB Delivery Lead
> **Last updated:** 2026-08-13
> **Branch:** `codex/phase-3-billing-gates`
> **Remote:** `origin/codex/phase-3-billing-gates`
> **Head:** `24529c4 fix(platform): harden locale catalog evidence`

This handoff captures the current state after the staff console, referral
lifecycle, privacy export, legal translation, PWA, and locale-catalog hardening
work. Treat `codex/phase-3-billing-gates` as the current working branch unless
the user asks to split the remaining launch work into a fresh branch.

## Current Git State

The working tree was clean after pushing `24529c4` to
`origin/codex/phase-3-billing-gates`.

Recent pushed commits:

```text
24529c4 fix(platform): harden locale catalog evidence
f932aa9 chore(platform): commit workspace polish
e5bc5fe feat(platform): publish authoritative english legal docs
ab3bc11 feat(platform): add pwa install shell
5d48dd5 feat(referrals): stabilize lifecycle gates
c9c2b40 feat(platform): close privacy export controls
eee1e11 feat(platform): close audit log search
d30168e feat(platform): close staff management
bfc1c6e feat(platform): close reference data management
a48e386 feat(platform): close member admin directory
bf60642 feat(platform): close finance dashboard metrics
3fc5eed feat(platform): close support dashboard metrics
```

`main` is clean and aligned with `origin/main`, but it does not contain this
handoff branch. Direct push to `main` is blocked by the repo's pre-push hook; use
a PR.

## Completed Work

- Phase 5 is code-complete in `docs/delivery/phase-5.md`: staff TOTP,
  dashboards, member admin, reference data, staff management, audit log search,
  privacy export, noindex controls, and legal EN source publication are marked
  done.
- Phase 6 is code-complete in `docs/delivery/phase-6.md`: referral lifecycle
  gating, rate limits, moderation, recipient visibility, redaction, expiry, and
  sender bar/unbar are marked done.
- Phase 7 has T-7.1 done in `docs/delivery/phase-7.md`: PWA manifest, app
  metadata, service worker registration, offline fallback, and card-page caching.
- Legal blocker is bypassed as requested: the user provided a Google Drive
  folder with approved Russian versions; the repo now has clean Russian
  non-authoritative MDX and authoritative English `{id}.en.mdx` files for all
  nine legal documents.
- Locale-catalog evidence was hardened: `src/i18n/i18n.test.ts` now rejects
  mojibake, replacement characters, and `????` placeholder corruption across
  `messages/{en,ru,uk}.json`.
- Remaining TOTP and directory hardcoded visible labels were moved into
  `next-intl` messages.

## Validation Evidence

The following passed locally after the latest pushed commit:

```powershell
pnpm verify
pnpm test:integration
pnpm build
pnpm i18n:check
pnpm test:unit -- src/i18n/i18n.test.ts tests/constraints/dashboard-i18n.test.ts
python tools/check-plan.py --strict
python tools/check-docs.py --strict
git diff --check
```

Observed counts:

- `pnpm i18n:check`: 631 keys x 3 locales, no gaps.
- `pnpm test:unit`: 26 files, 207 tests passed.
- `pnpm test:integration`: 16 files, 69 tests passed.
- `pnpm build`: Next.js production build completed successfully.

Lint warnings still appear in existing test/tool files for non-literal
filesystem paths and object injection sinks, but there are 0 lint errors.

## Production Launch Ledger State

Current `docs/delivery/production-launch-evidence.md` status summary:

- `AC-04` is `in_progress`: public card DTO is constrained, but preview raw
  response captures are still needed for valid, revoked, and unknown tokens.
- `AC-05` is `ready_for_rehearsal`: route registry and member-leak constraints
  exist; CI/preview evidence is still needed.
- `AC-07` is `ready_for_rehearsal`: i18n key completeness and catalog corruption
  checks pass locally; CI and visible screen smoke are still needed.
- `AC-09` is `ready_for_rehearsal`: restore runbook exists; restore drill
  evidence is still external.
- `AC-10` is `ready_for_rehearsal`: paging runbooks exist; rehearsal evidence is
  still external.
- `AC-11` is `ready_for_rehearsal`: legal pages and registration consent plumbing
  exist; preview/production URL and acceptance-record evidence is still needed.
- `AC-01`, `AC-02`, `AC-03`, `AC-06`, `AC-08`, and `AC-12` remain blocked by
  implementation confirmation, production-like measurement, Stripe test-clock
  evidence, WCAG audit, penetration test, or Twilio A2P approval.

Do not mark any row `complete` without linked CI, preview, production, vendor
dashboard, or rehearsal evidence.

## Recommended Next Steps

1. Start by confirming the branch and clean tree:

   ```powershell
   git status --short --branch
   ```

2. Open or update the PR from `codex/phase-3-billing-gates` into `main`. Direct
   `main` push is expected to fail.

3. If continuing code work before PR review, pick one launch ledger row:

   - `AC-04`: run preview smoke against `/en/card/<token>` for valid, revoked,
     and unknown tokens; attach raw response bodies.
   - `AC-03`: run Stripe test-clock lifecycle evidence end to end: subscribe,
     renew, fail, recover, cancel, lapse, duplicate and out-of-order webhooks.
   - `AC-07`: run CI plus visible screen smoke for EN/RU/UK to catch any
     hardcoded or corrupted text that static checks miss.
   - `AC-09` / `AC-10`: rehearse restore and paging runbooks; record elapsed
     time and corrections.
   - `AC-06` / `AC-08` / `AC-12`: schedule the external WCAG audit, penetration
     test, and Twilio A2P production SMS approval/smoke.

4. Keep the baseline green after every slice:

   ```powershell
   pnpm verify
   pnpm test:integration
   pnpm build
   python tools/check-plan.py --strict
   python tools/check-docs.py --strict
   git diff --check
   ```

## Guardrails For The Next Developer

- Do not bypass the `main` push guard with `--no-verify`; use a PR.
- Do not expose values from `.env.local`; report only key presence or failure.
- Do not commit `.tmp/` legal extraction or helper-script artifacts.
- Do not use broad regex-only localization rewrites; inspect the component and
  add a focused regression when moving visible text into messages.
- Do not treat local green checks as production launch approval. The remaining
  launch blockers require preview, production, vendor, or rehearsal evidence.
- If the tree is dirty at session start, inspect before editing and do not revert
  unrelated user changes.
