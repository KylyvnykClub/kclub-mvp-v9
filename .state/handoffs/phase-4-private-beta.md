# Handoff: Phase 4 — Private Beta

- **Created:** 2026-08-07
- **Last touched:** 2026-08-07
- **Status:** active
- **Branch:** `feat/T-0.18-observability`

## Goal

Ship the Private Beta milestone (requirements.md §6.1): phone sign-up, QR card,
catalogue with 30 seeded partners, Stripe VIP checkout, English legal docs.
Plan: `docs/delivery/phase-4.md` (5 tasks, exit checks, demo script).

## Where we are

|Task|Status|
|T-4.1 VIP checkout|done — test added (`tests/checkout-success.integration.test.ts`)|
|T-4.2 EN legal docs|blocked — awaiting EN source text from client counsel|
|T-4.3 beta seed|done (`f761c61`)|
|T-4.4 i18n sweep|done (`f761c61`)|
|T-4.5 staging verification|open (manual; depends on T-4.2/4.3)|

Exit checks already verified locally: `check-plan.py --strict`, `check-docs.py
--strict`, `pnpm verify` (all green; 139 unit tests).

## Committed work (this session)

### T-4.3 — beta seed (`tools/seed.ts`, `package.json`)
- `pnpm db:seed:beta` (`--beta` flag): 50 members (+38050100000x, password
  `BetaMember2026!`, argon2id, free cards `KCLUB-1000xx`, 4 legal acceptances
  v1.0, profiles, audit `member.registered` with `meta.source="beta_seed"`),
  30 fictional companies (approved, categories from ACTIVE rows), 30 synthetic
  listing subscriptions (`sub_seed_beta_<slug>`, active, +1y).
- **Why synthetic subscriptions:** catalogue filters on active `subscriptions`
  rows (`src/actions/company.ts` → `listCompanyIdsWithActiveSubscription`).
  Documented seed-only exception to ADR 0004 (header comment + phase-4.md).
- Idempotent: `onConflictDoNothing` on natural keys; dependents only when parent
  inserted. Refuses `--beta --production` combo.
- Uses dynamic `import("../src/data/db")` — env validation happens at import;
  dotenv `config()` in module body runs before the dynamic import but after
  hoisted static imports, so a static import would break plain `db:seed`.
- Requires `pnpm db:seed:categories` run first (fails fast with hint).

### T-4.4 — i18n full sweep (`messages/*.json` + 21 TSX files)
- New namespaces `catalogue`, `company`, `admin` (members/companies/categories/
  flags); extended `common`, `dashboard`, `Referral`, `billing`, `metadata`,
  `home.showcase`, `home.common`. **500 keys × 3 locales, no gaps.**
- Glossary fix: "Partners Directory" → "Partner Catalogue" in copy.
- Fixed live bug: `send-referral-dialog` `consentError` never passed by parent —
  now passed from `partners/[slug]/page.tsx`.
- Raw DB enums mapped to translated labels (card status, member status,
  category ACTIVE/INACTIVE, company moderation status).
- Root layout + register page metadata converted to `generateMetadata` using the
  previously unused `metadata` namespace.
- `dialog.tsx` (shadcn primitive) sr-only "Close" now uses `common.close` —
  deliberate exception to "ui primitives stay pure" (only primitive with text).
- Referral list components receive a translations prop but also call
  `useTranslations("Referral")` directly for the new strings (client components
  under the provider — works fine).

## Older loose ends (still open)

1. `src/app/fonts.ts` Manrope swap — uncommitted since 2026-08-06, not visually
   verified. Commit as `chore(web)`.
2. `outputs/` untracked project-tracker artifact — add to `.gitignore`.

## Next steps (suggested order)

1. Run `pnpm db:seed:beta` on staging/preview (NOT the unknown Neon instance
   without confirming it is throwaway), then T-4.5 demo script.
2. T-4.2 as soon as EN legal text arrives: drop `content/legal/{id}.en.mdx`
   files, set `authoritative: true` on EN, `false` on RU base.

## Learnings

- **Catalogue visibility = subscriptions table.** A company without an active
  subscription row is invisible even when approved. Any seed/demo data must
  include subscription rows.
- **tools/ + src/data imports:** env is validated eagerly at import
  (`src/env.ts`); tools must load env before importing `src/data/db` —
  dynamic import after `config()` or `tsx --env-file=.env.local`.
- **`i18n:check` only checks key parity across locales** — hardcoded JSX
  literals are invisible to it; that's what T-4.4 swept by hand.
- **Full-sweep i18n is mechanical but wide:** add ALL keys to all 3 locales
  first (i18n:check as compass), then refactor file by file; `pnpm verify`
  after each batch.
- **DATABASE_URL points at a Neon cloud instance** of unknown provenance —
  never run destructive/seeding scripts without confirming the target.

## Environment quirks

- Windows; Docker absent → integration tests only in CI.
- Pre-commit hooks: eslint --fix + prettier; gitleaks missing (warning only);
  use 300s timeout for large stages.
