/**
 * KCLUB run driver - launches a browser against a running KCLUB server and
 * drives it as a signed-in staff user or an anonymous visitor.
 *
 * Run it with tsx (it imports the application's TypeScript TOTP module):
 *
 *   pnpm exec tsx .claude/skills/run-kclub/driver.mjs screens
 *
 * Staff sign-in is the whole reason this file exists. identity/service.ts
 * requires a second factor for every staff role, so a password alone leaves a
 * partial session that cannot open the console. The driver reads the owner's
 * encrypted seed from the database, decrypts it with the application's own
 * decryptTotpSecret(), and derives the current code - so no credential has to
 * be typed into a prompt or pasted into a transcript.
 *
 * Commands
 *   screens                       walk the nine staff console screens
 *   public                        walk the main public screens, signed out
 *   probe <path> [--anon]         one route: status, h1, row count, errors
 *   click <path> <name> [--anon]  click a control, report url/rows before+after
 *   shot  <path> [--anon]         screenshot one route
 *
 * Environment
 *   KCLUB_BASE_URL  default http://localhost:3000
 *   HEADED=1        show the browser window
 */

import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { chromium } from "@playwright/test";
import { generateTOTP } from "@oslojs/otp";
import { decodeBase32 } from "@oslojs/encoding";
import { decryptTotpSecret } from "../../../src/modules/identity/totp-crypto.ts";

config({ path: ".env.local", quiet: true });

const BASE = process.env.KCLUB_BASE_URL ?? "http://localhost:3000";
const SHOTS = ".playwright/run-kclub";

/** The nine console routes, in sidebar order. */
const CONSOLE_SCREENS = [
  ["01-overview", "/en/dashboard/admin"],
  ["02-members", "/en/dashboard/admin/members"],
  ["03-companies", "/en/dashboard/admin/companies"],
  ["04-referrals", "/en/dashboard/admin/referrals"],
  ["05-support", "/en/dashboard/admin/support"],
  ["06-audit", "/en/dashboard/admin/audit"],
  ["07-staff", "/en/dashboard/admin/staff"],
  ["08-flags", "/en/dashboard/admin/flags"],
  ["09-categories", "/en/dashboard/admin/categories"],
];

/** Public routes that need no session. */
const PUBLIC_SCREENS = [
  ["p1-home", "/en"],
  ["p2-login", "/en/login"],
  ["p3-register", "/en/register"],
  ["p4-catalogue", "/en/directory"],
  ["p5-legal", "/en/legal"],
];

function fail(message) {
  console.error(`\nx ${message}\n`);
  process.exit(1);
}

/**
 * Git Bash on Windows rewrites an argument that starts with a slash into a
 * Windows path - `/en` arrives as `C:/Program Files/Git/en`. Recover the route
 * from that, and accept a slashless `en/...` as well, so the same command line
 * works from PowerShell, Git Bash and CI.
 */
function normalisePath(input) {
  const mangled = /^[A-Za-z]:[\\/].*?[\\/]Git[\\/](.*)$/.exec(input);
  const path = mangled ? mangled[1] : input;
  return path.startsWith("/") ? path : `/${path}`;
}

/** The staff owner's current 6-digit code, derived the way the app verifies it. */
async function staffTotpCode() {
  const phone = process.env.ADMIN_BOOTSTRAP_OWNER_PHONE;
  const key = process.env.TOTP_ENCRYPTION_KEY;
  if (!phone) fail("ADMIN_BOOTSTRAP_OWNER_PHONE is not set in .env.local");
  if (!key) fail("TOTP_ENCRYPTION_KEY is not set in .env.local");

  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`
    select id, totp_secret, totp_enabled from members where phone = ${phone} limit 1
  `;
  const row = rows[0];
  if (!row) fail(`no member with phone ${phone} - run: pnpm db:seed`);
  if (!row.totp_enabled) {
    fail(
      `${phone} has not enrolled an authenticator yet. Sign in once by hand to ` +
        "complete enrolment, then re-run.",
    );
  }

  const secret = decryptTotpSecret(row.totp_secret, row.id, key);
  if (!secret) {
    fail(
      "could not decrypt the staff TOTP seed - TOTP_ENCRYPTION_KEY does not " +
        "match the key the seed was written with",
    );
  }
  return generateTOTP(decodeBase32(secret), 30, 6);
}

async function signInAsStaff(page) {
  await page.goto(`${BASE}/en/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#phone", process.env.ADMIN_BOOTSTRAP_OWNER_PHONE);
  await page.fill("#password", process.env.ADMIN_BOOTSTRAP_OWNER_PASSWORD);
  await page.click('button[type="submit"]');

  // Generated immediately before it is typed, so a slow first page load cannot
  // spend the 30-second window before the code is submitted.
  await page.waitForSelector("#code", { timeout: 60_000 });
  await page.fill("#code", await staffTotpCode());
  await page.click('button[type="submit"]');

  // Sign-in lands on the member profile, never on the console.
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

async function openPage(browser, { anon }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(60_000);

  const errors = [];
  const failures = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 400) {
      failures.push(`${r.status()} ${r.request().method()} ${r.url()}`);
    }
  });

  if (!anon) await signInAsStaff(page);
  return { page, errors, failures };
}

/** What a screen actually rendered - enough to tell "it worked" from "it 500ed". */
async function describe(page) {
  const h1 = await page
    .locator("h1")
    .first()
    .textContent()
    .catch(() => null);
  return {
    url: page.url().replace(BASE, ""),
    h1: h1?.trim().replace(/\s+/g, " ") ?? null,
    rows: await page.locator("table tbody tr").count(),
  };
}

function report(errors, failures) {
  const unique = (list) => [...new Set(list)];
  console.log("\nconsole errors :", errors.length ? "" : "(none)");
  if (errors.length) console.log(unique(errors).join("\n"));
  console.log("responses >=400:", failures.length ? "" : "(none)");
  if (failures.length) console.log(unique(failures).join("\n"));
}

async function walk(screens, options) {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const { page, errors, failures } = await openPage(browser, options);
  if (!options.anon) console.log("signed in as the staff owner\n");

  for (const [name, path] of screens) {
    const started = Date.now();
    const response = await page.goto(`${BASE}${path}`, {
      waitUntil: "networkidle",
    });
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
    const info = await describe(page);
    console.log(
      `${response?.status() ?? "---"} ${path.padEnd(34)} ` +
        `h1=${JSON.stringify(info.h1)} rows=${info.rows} ` +
        `${Date.now() - started}ms`,
    );
  }

  report(errors, failures);
  console.log(`\nscreenshots: ${SHOTS}/`);
  await browser.close();
}

/**
 * A control by its accessible name, whatever element it turned out to be.
 * The console mixes them: filter chips are <button>, pagination is
 * <Button asChild><Link> so "Next" is an <a>, and the arrows carry only an
 * aria-label. Asking for one specific role is how you get a 30-second timeout.
 */
function control(page, name) {
  return page
    .getByRole("button", { name, exact: false })
    .or(page.getByRole("link", { name, exact: false }))
    .or(page.locator(`[aria-label="${name}"]`))
    .first();
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = rest.filter((a) => !a.startsWith("--"));
  const anon = rest.includes("--anon");

  if (command === "screens") return walk(CONSOLE_SCREENS, { anon: false });
  if (command === "public") return walk(PUBLIC_SCREENS, { anon: true });

  if (command === "probe" || command === "shot" || command === "click") {
    if (!args[0]) fail(`usage: ${command} <path> [--anon]`);
    const path = normalisePath(args[0]);

    const browser = await chromium.launch({ headless: !process.env.HEADED });
    const { page, errors, failures } = await openPage(browser, { anon });
    const response = await page.goto(`${BASE}${path}`, {
      waitUntil: "networkidle",
    });
    console.log(`${response?.status() ?? "---"} ${path}`);
    console.log("before:", JSON.stringify(await describe(page)));

    if (command === "click") {
      const name = args[1];
      if (!name) fail("usage: click <path> <accessible name> [--anon]");
      await control(page, name).click();
      // A query-only navigation settles without a load event; wait, then look.
      await page.waitForTimeout(4000);
      console.log("after :", JSON.stringify(await describe(page)));
    }

    const slug = path.replace(/\W+/g, "-").replace(/^-|-$/g, "");
    await page.screenshot({ path: `${SHOTS}/${slug}.png`, fullPage: true });
    report(errors, failures);
    console.log(`\nscreenshot: ${SHOTS}/${slug}.png`);
    return browser.close();
  }

  fail(
    "usage: driver.mjs <screens|public|probe|click|shot> [args]\n" +
      "  screens                       the nine console screens\n" +
      "  public                        the main public screens\n" +
      "  probe <path> [--anon]         one route\n" +
      "  click <path> <name> [--anon]  click a control, report before/after\n" +
      "  shot  <path> [--anon]         screenshot one route",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
