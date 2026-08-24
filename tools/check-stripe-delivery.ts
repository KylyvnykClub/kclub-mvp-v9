/**
 * Read-only diagnostic for the Stripe → entitlement path.
 *
 * Usage:
 *   pnpm stripe:check
 *   pnpm stripe:check +380XXXXXXXXX     — also show that member's card and subscription
 *
 * Answers the four questions phase 1 of the `paid-upgrade-does-not-take-effect`
 * handoff validates against, in one place:
 *
 *   1. Has Stripe ever delivered?      → processed_webhooks
 *   2. Did the projection run?         → subscriptions (non-seed rows)
 *   3. Is anything stuck?              → outbox pending depth and age
 *   4. Did the member actually get it? → cards.tier
 *
 * This script issues SELECTs and nothing else. It reads DATABASE_URL from
 * .env.local, which on this project is the production database — see the
 * handoff. Reading is safe; nothing here writes, and the fix for a wrong tier
 * is always to resend the Stripe event, never to edit the row.
 */

import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local", quiet: true });

const DATABASE_URL = process.env["DATABASE_URL"];

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const phone = process.argv[2];

function ageOf(value: unknown): string {
  if (!value) return "never";
  const then = new Date(value as string).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 90) return `${seconds}s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

function heading(text: string): void {
  console.log(`\n── ${text} ${"─".repeat(Math.max(0, 60 - text.length))}`);
}

async function main(): Promise<void> {
  const key = process.env["STRIPE_SECRET_KEY"] ?? "";
  const mode = key.startsWith("sk_live_")
    ? "LIVE"
    : key.startsWith("sk_test_")
      ? "TEST"
      : "unknown";
  console.log(`Local STRIPE_SECRET_KEY mode: ${mode}`);
  console.log(
    "  (this is .env.local's key — Vercel's may differ, and the webhook endpoint must be in the same mode as whichever key took the payment)",
  );

  heading("1. Webhook deliveries (processed_webhooks)");
  const webhooks = await sql`
    SELECT id, type, created_at
    FROM processed_webhooks
    ORDER BY created_at DESC
    LIMIT 10
  `;
  const [{ count: webhookCount }] = (await sql`
    SELECT count(*)::int AS count FROM processed_webhooks
  `) as [{ count: number }];

  if (webhookCount === 0) {
    console.log(
      "  EMPTY — Stripe has never delivered a verified event to this database.",
    );
    console.log(
      "  Everything below will be empty as a consequence. Fix delivery first.",
    );
  } else {
    console.log(
      `  ${webhookCount} total, newest ${ageOf(webhooks[0]?.["created_at"])}`,
    );
    for (const row of webhooks) {
      console.log(
        `    ${String(row["created_at"])}  ${String(row["type"]).padEnd(38)} ${String(row["id"])}`,
      );
    }
  }

  heading("2. Projected subscriptions");
  const subs = await sql`
    SELECT stripe_subscription_id, member_id, status, price_id,
           current_period_end, stripe_updated_at, created_at
    FROM subscriptions
    ORDER BY created_at DESC
    LIMIT 10
  `;
  const real = subs.filter(
    (row) => !String(row["stripe_subscription_id"]).startsWith("sub_seed"),
  );
  console.log(
    `  ${subs.length} shown, ${real.length} of them non-seed (a seed row is sub_seed_*, and proves nothing)`,
  );
  for (const row of subs) {
    console.log(
      `    ${String(row["stripe_subscription_id"]).padEnd(32)} ${String(row["status"]).padEnd(10)} member=${String(row["member_id"])}`,
    );
  }

  heading("2b. Seed data still in this database");
  const [seedCounts] = (await sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE stripe_subscription_id LIKE 'sub_seed%')::int AS seeded
    FROM subscriptions
  `) as [{ total: number; seeded: number }];
  const visibleSeeded = await sql`
    SELECT c.name, c.moderation_status, s.stripe_subscription_id
    FROM subscriptions s
    JOIN companies c ON c.id = s.company_id
    WHERE s.stripe_subscription_id LIKE 'sub_seed%'
      AND s.status IN ('active', 'past_due')
      AND c.moderation_status = 'approved'
    ORDER BY c.name
  `;
  console.log(
    `  ${seedCounts.seeded} of ${seedCounts.total} subscriptions are seed rows`,
  );
  if (visibleSeeded.length > 0) {
    console.log(
      `  ${visibleSeeded.length} of them back an APPROVED company, which is what the catalogue lists:`,
    );
    for (const row of visibleSeeded) {
      console.log(`    ${String(row["name"])}`);
    }
    console.log(
      "  On a live launch these are invented partners shown to real members.",
    );
  } else {
    console.log("  None of them back an approved company.");
  }

  heading("3. Outbox");
  const [pending] = (await sql`
    SELECT count(*)::int AS depth, min(created_at) AS oldest
    FROM outbox
    WHERE processed_at IS NULL
  `) as [{ depth: number; oldest: string | null }];
  console.log(`  ${pending.depth} pending, oldest ${ageOf(pending.oldest)}`);
  if (pending.depth > 0) {
    console.log(
      "  A non-zero depth that is more than a few seconds old means the inline drain (ADR 0017) did not finish and the daily sweep has not caught up.",
    );
    const stuck = await sql`
      SELECT id, created_at, topic, payload
      FROM outbox
      WHERE processed_at IS NULL
      ORDER BY created_at
      LIMIT 10
    `;
    for (const row of stuck) {
      const payload = row["payload"] as Record<string, unknown>;
      const summary = Object.entries(payload ?? {})
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(" ");
      console.log(
        `    ${ageOf(row["created_at"])}  ${String(row["topic"])}  ${summary}`,
      );
    }
  }

  heading("4. Cards by tier");
  const tiers = await sql`
    SELECT tier, status, count(*)::int AS count
    FROM cards
    GROUP BY tier, status
    ORDER BY tier, status
  `;
  for (const row of tiers) {
    console.log(
      `    ${String(row["tier"]).padEnd(6)} ${String(row["status"]).padEnd(8)} ${String(row["count"])}`,
    );
  }

  if (phone) {
    heading(`5. Member ${phone}`);
    const members = await sql`
      SELECT id, display_name, created_at
      FROM members
      WHERE phone = ${phone}
    `;
    const member = members[0];
    if (!member) {
      console.log("  No member with that phone.");
    } else {
      console.log(`  member_id=${String(member["id"])}`);
      const cards = await sql`
        SELECT serial, tier, status, updated_at
        FROM cards
        WHERE member_id = ${member["id"]}
      `;
      for (const card of cards) {
        console.log(
          `    card ${String(card["serial"])}  tier=${String(card["tier"])}  status=${String(card["status"])}  updated ${ageOf(card["updated_at"])}`,
        );
      }
      const theirs = await sql`
        SELECT stripe_subscription_id, status, current_period_end
        FROM subscriptions
        WHERE member_id = ${member["id"]}
      `;
      if (theirs.length === 0) {
        console.log("    no subscription row — the projection never ran");
      }
      for (const row of theirs) {
        console.log(
          `    sub ${String(row["stripe_subscription_id"])}  ${String(row["status"])}  period ends ${String(row["current_period_end"])}`,
        );
      }
    }
  }

  console.log("");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
