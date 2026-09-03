/**
 * Rewrite every `members.phone` into E.164 (ADR 0027).
 *
 * Usage:
 *   pnpm db:normalize-phones              # report only, writes nothing
 *   pnpm db:normalize-phones --apply      # perform the rewrite
 *
 * This has to run *before* the code that assumes E.164 reaches production.
 * `findMemberByPhone` compares with `=`, so the moment sign-in starts
 * normalising its input, every row still holding an unnormalised number
 * becomes unreachable and that member is locked out.
 *
 * It is a tool rather than a SQL migration for the same reason
 * `20260827160000_company_slug_backfill` could not call `companySlug`: a
 * national number cannot be read without knowing its country, and the only
 * thing that knows how to apply `members.country` to it is
 * `libphonenumber-js`, which SQL cannot reach.
 *
 * The decision itself is in `src/lib/phone-backfill.ts` and is unit-tested;
 * this file is the database around it.
 */

import { config } from "dotenv";

import { listMemberPhones, updateMemberPhone } from "../src/data/members";
import { planPhoneNormalisation } from "../src/lib/phone-backfill";
import {
  assertDatabaseEnvironment,
  openMarkerClient,
} from "./assert-database-environment";

config({ path: ".env.local", quiet: true });

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const productionFlag = args.includes("--production");

async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local.");
    process.exit(1);
  }

  await assertDatabaseEnvironment({
    tool: "db:normalize-phones",
    productionFlag,
  });

  const db = openMarkerClient(databaseUrl);
  const rows = await listMemberPhones(db);
  const plan = planPhoneNormalisation(rows);

  console.log(`\nmembers:       ${rows.length}`);
  console.log(`already E.164: ${plan.unchanged.length}`);
  console.log(`to rewrite:    ${plan.planned.length}`);
  console.log(`unreadable:    ${plan.unreadable.length}`);

  if (plan.planned.length > 0) {
    console.log("\nPlanned rewrites:");
    for (const { row, next } of plan.planned) {
      console.log(`  ${row.id}  ${row.phone}  ->  ${next}  (${row.country})`);
    }
  }

  if (plan.unreadable.length > 0) {
    console.log(
      "\nLeft untouched - not readable as a phone number in any form:",
    );
    for (const row of plan.unreadable) {
      console.log(`  ${row.id}  ${row.phone}  (${row.country})`);
    }
    console.log(
      "  Sign-in still reaches these by exact match; registration can no longer create them.",
    );
  }

  if (plan.collisions.length > 0) {
    console.error(
      `\n❌ ${plan.collisions.length} number(s) would be held by more than one member.`,
    );
    for (const { number, owners } of plan.collisions) {
      console.error(`\n  ${number}`);
      for (const owner of owners) {
        console.error(`    ${owner.id}  currently ${owner.phone}`);
      }
    }
    console.error(
      "\nNothing was written. These are duplicate accounts that the unique index" +
        "\nnever caught. Decide which row keeps the number - it owns that member's" +
        "\nsubscriptions, card and audit history - then re-run.",
    );
    process.exit(1);
  }

  if (plan.planned.length === 0) {
    console.log("\n✅ Nothing to rewrite.");
    return;
  }

  if (!apply) {
    console.log("\nReport only. Re-run with --apply to write these changes.");
    return;
  }

  for (const { row, next } of plan.planned) {
    await updateMemberPhone(db, row.id, next);
  }

  console.log(
    `\n✅ Rewrote ${plan.planned.length} phone number(s) into E.164.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
