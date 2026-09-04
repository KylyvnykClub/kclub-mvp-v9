---
name: run-kclub
description: Build, run and drive the KCLUB app. Use when asked to start the app, launch the server, open the staff console, take a screenshot of a screen, click something in the running UI, or confirm a change works in the real app rather than in tests.
---

KCLUB is a Next.js 15 App Router app with a public site, a member dashboard and
a staff console. Drive it with `.claude/skills/run-kclub/driver.mjs` — a
Playwright harness that signs in as the seeded staff owner (password **and**
TOTP, which the console requires) and reports what each screen actually
rendered.

Paths below are relative to the repository root. Everything here was run on
Windows 10 (PowerShell and Git Bash both work) against the `dev` Neon database
in `.env.local`.

**Serve a production build, never `next dev`.** Under `next dev` this app
compiles 120–300 s per route on first hit, which blows through every default
Playwright timeout. `pnpm build` + `pnpm start` answers in single-digit
milliseconds. See Gotchas.

## Prerequisites

Node 22+, pnpm 10, and a populated `.env.local` (`DATABASE_URL`,
`TOTP_ENCRYPTION_KEY`, `ADMIN_BOOTSTRAP_OWNER_PHONE`,
`ADMIN_BOOTSTRAP_OWNER_PASSWORD` — the driver reads these itself, so no
credential is ever typed into a prompt).

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

## Build and launch

`next dev` and `next build` share `.next` and clobber each other's chunks, so
clear it when switching modes:

```bash
rm -rf .next
pnpm build
```

Start it in the background (PowerShell: `Start-Process pnpm start`), then wait
for it to answer:

```bash
pnpm start
curl -s -o /dev/null -w "%{http_code}\n" --max-time 10 http://127.0.0.1:3000/en/login
```

`200` means ready — it takes about 1.5 s.

## Drive it (agent path)

```bash
pnpm exec tsx .claude/skills/run-kclub/driver.mjs screens
```

Signs in as the staff owner and walks all nine console screens, screenshotting
each to `.playwright/run-kclub/` and printing status, `h1`, table row count and
timing, then every console error and every response ≥ 400:

```
signed in as the staff owner

200 /en/dashboard/admin                h1="Overview" rows=10 3772ms
200 /en/dashboard/admin/members        h1="Member & Card Administration" rows=20 2597ms
200 /en/dashboard/admin/companies      h1="Company Moderation" rows=20 2140ms
200 /en/dashboard/admin/referrals      h1="Client Introductions" rows=1 2191ms
200 /en/dashboard/admin/support        h1="Support Dashboard" rows=0 2107ms
200 /en/dashboard/admin/audit          h1="Audit Logs" rows=83 2207ms
200 /en/dashboard/admin/staff          h1="Staff Management" rows=1 2142ms
200 /en/dashboard/admin/flags          h1="Feature Flags" rows=0 2080ms
200 /en/dashboard/admin/categories     h1="Reference Data" rows=1263 4862ms

console errors : (none)
responses >=400: (none)
```

The other commands:

```bash
# The main public screens, signed out
pnpm exec tsx .claude/skills/run-kclub/driver.mjs public

# One route — status, h1, rows, console errors, screenshot
pnpm exec tsx .claude/skills/run-kclub/driver.mjs probe /en/dashboard/admin/staff
pnpm exec tsx .claude/skills/run-kclub/driver.mjs probe /en/directory --anon

# Click a control by accessible name and report url/rows before and after
pnpm exec tsx .claude/skills/run-kclub/driver.mjs click /en/dashboard/admin/members Companies

# Screenshot only
pnpm exec tsx .claude/skills/run-kclub/driver.mjs shot /en/dashboard/admin
```

`click` is the one that proves a change works. It reports both sides, so a
control that does nothing is visible rather than silently passing:

```
200 /en/dashboard/admin/members
before: {"url":"/en/dashboard/admin/members","h1":"Member & Card Administration","rows":20}
after : {"url":"/en/dashboard/admin/companies","h1":"Company Moderation","rows":20}
```

`HEADED=1` shows the browser window; `KCLUB_BASE_URL` points at another origin.

**Look at the screenshots.** `.playwright/run-kclub/*.png` are full-page at
1440×900. A 200 with a plausible `h1` still renders a blank panel if a chart or
a data fetch failed.

## Run (human path)

`pnpm dev` on <http://localhost:3000>, sign in at `/en/login`. Usable for
editing with hot reload; useless for driving, because of the compile times
below.

## Test

```bash
pnpm verify              # typecheck + lint + format + i18n + unit + build
pnpm test:e2e            # Playwright + axe; needs Docker (Testcontainers)
```

`pnpm test:e2e` covers ten member-facing screens (`tests/e2e/screens.ts`) and
**no console screen** — the console is only exercised by this driver.

## Gotchas

- **Never build into `.next` while someone is running `pnpm dev`.** They share
  the directory, and a production build replaces the dev server's chunks: the
  running dev server then dies with `Cannot find module './2045.js'` and has to
  be restarted after `rm -rf .next`. Build into a directory of your own instead
  — `NEXT_BUILD_DIR=.next-driver pnpm build` and
  `NEXT_BUILD_DIR=.next-driver PORT=3100 pnpm start`, the same mechanism
  `pnpm verify:build` uses for `.next-verify`.

- **`next dev` is unusably slow for driving.** Measured on this machine:
  `/en/login` 124 s on first hit, `/en/dashboard/admin/members` 284 s. Sessions
  also dropped mid-walk (307 back to `/en/login`). Always drive a production
  build.
- **Staff sign-in needs TOTP.** `identity/service.ts` sets `requiresTotp` for
  every staff role; a password alone leaves a *partial* session that cannot open
  the console. The driver decrypts `members.totp_secret` with the app's own
  `decryptTotpSecret()` and derives the code. Wrong `TOTP_ENCRYPTION_KEY` →
  "could not decrypt the staff TOTP seed".
- **Sign-in lands on `/en/dashboard/profile`, not the console.** Navigate to
  `/en/dashboard/admin` explicitly.
- **Console pagination is not a button.** `<Button asChild><Link>` renders
  "Next" as an `<a>`, while a *disabled* "Previous" stays a `<button>`, and both
  carry only an `aria-label`. `getByRole("button", { name: "Next" })` times out
  after 30 s. The driver's `control()` tries button, then link, then
  `[aria-label]`.
- **Query-only navigation is broken in the console** (production build only —
  it works under `next dev`). Filter chips, pagination and the overview period
  selector all fetch the right RSC payload, get a 200, and then never commit:
  the URL and the table stay put. Pathname navigation (sidebar, breadcrumb)
  works, the same states work when the URL is entered directly, and the public
  catalogue's `?page=2` link works in the same build. Expect
  `click … Business` to be a no-op until this is fixed — the driver is fine.
- **`/en/directory` throws React error #418** (hydration text mismatch) in a
  production build. `driver.mjs probe /en/directory --anon` reproduces it.
- **Row counts are `<table>` rows.** Flags and Support render cards, so
  `rows=0` there is correct, not a failure.
- **Driving writes to the dev database.** Every staff sign-in appends audit
  rows (`Audit Logs` went 65 → 83 across a few runs). Harmless on `dev`; the
  `database_environment` marker table is what keeps it off production.
- **Git Bash mangles route arguments.** `/en` arrives as
  `C:/Program Files/Git/en`. The driver detects and unmangles it, but
  `MSYS_NO_PATHCONV=1` or PowerShell avoids it entirely.
- **Scratch scripts must live inside the repo.** A `.ts` file outside it
  resolves neither `dotenv` nor `@/*`, and without the repo's
  `"type": "module"` tsx compiles it as CJS and rejects top-level `await`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `no member with phone … - run: pnpm db:seed` | The bootstrap staff owner is missing. `pnpm db:seed` creates it from `ADMIN_BOOTSTRAP_OWNER_*` (documented in `tools/seed.ts`; not exercised in this session — it also creates Stripe products when `STRIPE_SECRET_KEY` is set). |
| `… has not enrolled an authenticator yet` | The owner exists but `totp_enabled` is false. Sign in once by hand to finish enrolment (the QR is shown), then re-run. |
| `page.goto: Timeout … exceeded` on the first request | You are on `next dev`. Stop it, `rm -rf .next`, `pnpm build`, `pnpm start`. |
| `Cannot find module './vendor-chunks/…'` | `.next` holds mixed dev and build output. `rm -rf .next` and rebuild. |
| `Cannot navigate to invalid URL … /Git/en` | Git Bash path mangling — prefix `MSYS_NO_PATHCONV=1` or use PowerShell. |
| Every route 307s to `/en/login` | No session cookie: sign-in failed, or the TOTP code expired between generation and submission. Re-run. |
| Stop the server | PowerShell: `Get-Process node \| Stop-Process -Force` (kills every node process). |
