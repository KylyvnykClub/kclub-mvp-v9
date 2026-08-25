/**
 * Remove the private-beta seed dataset from a database it should never have
 * reached.
 *
 * Usage:
 *   pnpm beta:purge              — dry run, prints exactly what would go
 *   pnpm beta:purge --execute --confirm-production-purge
 *                                — actually deletes after an explicit confirm
 *
 * Why this exists: `pnpm db:seed:beta` inserts 50 synthetic members, 30
 * companies and 30 `sub_seed_beta_*` subscriptions. Its production guard checks
 * a CLI flag, not the database it is pointed at, so running it without
 * `--production` against a `.env.local` that holds production credentials seeds
 * production. The companies land `approved` with `active` listing
 * subscriptions, which is exactly the condition
 * `listCompanyIdsWithActiveSubscription` uses to publish a partner — so real
 * members see invented partners.
 *
 * How it decides what to delete: the seed generates deterministic phone
 * numbers, `betaPhone(i) = +380501${i padded to 6}` for i in 0..49. This script
 * rebuilds that exact list of 50 strings and touches nothing else. It does not
 * pattern-match, so a real member cannot be caught by a wildcard.
 *
 * Everything else follows by `ON DELETE CASCADE` from `members`: cards,
 * companies, subscriptions, profiles, legal acceptances, sessions, stripe
 * customer mappings. Audit entries are deliberately not deleted — an audit log
 * is evidence, and `meta.source = "beta_seed"` already marks them.
 */

import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { betaPurgeRefusal, describeDatabaseTarget } from "./beta-seed-guard";

config({ path: ".env.local", quiet: true });

const DATABASE_URL = process.env["DATABASE_URL"];

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const execute = process.argv.includes("--execute");
const confirmedProductionPurge = process.argv.includes(
  "--confirm-production-purge",
);

/** Mirrors betaPhone() in tools/seed.ts. Deterministic, exact, 50 values. */
const BETA_PHONES = Array.from(
  { length: 50 },
  (_, i) => `+380501${String(i).padStart(6, "0")}`,
);

function heading(text: string): void {
  console.log(`\n── ${text} ${"─".repeat(Math.max(0, 58 - text.length))}`);
}

async function main(): Promise<void> {
  const target = describeDatabaseTarget(DATABASE_URL!);
  console.log(
    execute
      ? "MODE: execute — rows will be deleted"
      : "MODE: dry run — nothing will be deleted (pass --execute to delete)",
  );
  console.log(`TARGET: ${target}`);

  const refusal = betaPurgeRefusal({
    execute,
    confirmedProductionPurge,
  });
  if (refusal) {
    console.error(`\nRefusing to continue. ${refusal}\n`);
    process.exit(1);
  }

  heading("Members matching the beta seed's phone numbers");
  const betaMembers = await sql`
    SELECT id, phone, display_name, created_at
    FROM members
    WHERE phone = ANY(${BETA_PHONES})
    ORDER BY phone
  `;
  console.log(`  ${betaMembers.length} of the 50 seeded phones are present`);

  if (betaMembers.length === 0) {
    console.log("\nNothing to do.\n");
    return;
  }

  const ids = betaMembers.map((row) => String(row["id"]));

  heading("What cascades with them");
  const [counts] = (await sql`
    SELECT
      (SELECT count(*)::int FROM cards WHERE member_id = ANY(${ids})) AS cards,
      (SELECT count(*)::int FROM companies WHERE owner_id = ANY(${ids})) AS companies,
      (SELECT count(*)::int FROM subscriptions WHERE member_id = ANY(${ids})) AS subs,
      (SELECT count(*)::int FROM profiles WHERE member_id = ANY(${ids})) AS profiles,
      (SELECT count(*)::int FROM legal_acceptances WHERE member_id = ANY(${ids})) AS acceptances
  `) as [
    {
      cards: number;
      companies: number;
      subs: number;
      profiles: number;
      acceptances: number;
    },
  ];
  console.log(`    members       ${betaMembers.length}`);
  console.log(`    cards         ${counts.cards}`);
  console.log(`    companies     ${counts.companies}`);
  console.log(`    subscriptions ${counts.subs}`);
  console.log(`    profiles      ${counts.profiles}`);
  console.log(`    acceptances   ${counts.acceptances}`);

  heading("Safety check: seed subscriptions not owned by a seeded member");
  const strays = await sql`
    SELECT stripe_subscription_id, member_id
    FROM subscriptions
    WHERE stripe_subscription_id LIKE 'sub_seed%'
      AND NOT (member_id = ANY(${ids}))
  `;
  if (strays.length > 0) {
    console.error(
      `  ${strays.length} sub_seed_* row(s) belong to a member outside the beta phone list:`,
    );
    for (const row of strays) {
      console.error(
        `    ${String(row["stripe_subscription_id"])} member=${String(row["member_id"])}`,
      );
    }
    console.error(
      "  Refusing to continue. Deleting by phone would leave these behind, and\n" +
        "  they would keep publishing a partner. Investigate before purging.",
    );
    process.exit(1);
  }
  console.log("  none — every seed subscription belongs to a seeded member");

  heading("Safety check: real data that will survive");
  const [survivors] = (await sql`
    SELECT
      (SELECT count(*)::int FROM members WHERE NOT (phone = ANY(${BETA_PHONES}))) AS members,
      (SELECT count(*)::int FROM cards c
        JOIN members m ON m.id = c.member_id
        WHERE NOT (m.phone = ANY(${BETA_PHONES}))) AS cards,
      (SELECT count(*)::int FROM companies co
        JOIN members m ON m.id = co.owner_id
        WHERE NOT (m.phone = ANY(${BETA_PHONES}))) AS companies
  `) as [{ members: number; cards: number; companies: number }];
  console.log(`    members       ${survivors.members}`);
  console.log(`    cards         ${survivors.cards}`);
  console.log(`    companies     ${survivors.companies}`);

  if (!execute) {
    console.log(
      "\nDry run only. Re-run with --execute --confirm-production-purge to delete the rows listed above.\n",
    );
    return;
  }

  heading("Deleting");
  const deleted = await sql`
    DELETE FROM members
    WHERE phone = ANY(${BETA_PHONES})
    RETURNING id
  `;
  console.log(`  ${deleted.length} members deleted, cascades applied`);

  heading("After");
  const [remaining] = (await sql`
    SELECT
      (SELECT count(*)::int FROM subscriptions WHERE stripe_subscription_id LIKE 'sub_seed%') AS seed_subs,
      (SELECT count(*)::int FROM members) AS members,
      (SELECT count(*)::int FROM companies) AS companies
  `) as [{ seed_subs: number; members: number; companies: number }];
  console.log(`    seed subscriptions remaining ${remaining.seed_subs}`);
  console.log(`    members                      ${remaining.members}`);
  console.log(`    companies                    ${remaining.companies}`);
  console.log(
    "\nAudit entries are intentionally left in place — they are evidence, and\n" +
      'the seeded ones carry meta.source = "beta_seed".\n',
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
