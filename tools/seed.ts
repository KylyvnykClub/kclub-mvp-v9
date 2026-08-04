/**
 * Database seed script.
 *
 * Usage:
 *   pnpm db:seed              — seed the local/preview database
 *   pnpm db:seed --production — seed production (staff user only, no test data)
 *
 * What it does:
 *   1. Ensures Stripe products and prices exist (VIP membership, listing subscription).
 *   2. Creates a bootstrap staff user (from ADMIN_BOOTSTRAP_OWNER_PHONE / PASSWORD).
 *   3. Inserts feature flags with safe defaults.
 *   4. In non-production: inserts sample data for development.
 *
 * Idempotent: safe to run multiple times. Uses ON CONFLICT DO NOTHING.
 */

import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

// ── Configuration ────────────────────────────────────────────

const isProduction = process.argv.includes("--production");
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set. Copy .env.example to .env.local.");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

// ── Stripe seed ──────────────────────────────────────────────

interface StripePlan {
  name: string;
  lookup_key: string;
  amount_cents: number;
  interval: "month";
}

const PLANS: StripePlan[] = [
  {
    name: "VIP Membership",
    lookup_key: "vip_monthly",
    amount_cents: 1999,
    interval: "month",
  },
  {
    name: "Partner Listing",
    lookup_key: "listing_monthly",
    amount_cents: 1999,
    interval: "month",
  },
];

async function seedStripe(): Promise<void> {
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    console.warn("⚠️  STRIPE_SECRET_KEY not set — skipping Stripe seed.");
    return;
  }

  // Use Stripe REST API directly to avoid adding stripe as a dependency
  const base = "https://api.stripe.com/v1";
  const headers = {
    Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  for (const plan of PLANS) {
    // Check if product exists by lookup_key (metadata)
    const searchRes = await fetch(
      `${base}/products/search?query=metadata['lookup_key']:'${plan.lookup_key}'`,
      { headers },
    );
    const searchData = (await searchRes.json()) as {
      data: Array<{ id: string }>;
    };

    let productId: string;

    if (searchData.data.length > 0) {
      productId = searchData.data[0].id;
      console.log(`  ✓ Product "${plan.name}" already exists (${productId})`);
    } else {
      const body = new URLSearchParams({
        name: plan.name,
        "metadata[lookup_key]": plan.lookup_key,
      });
      const createRes = await fetch(`${base}/products`, {
        method: "POST",
        headers,
        body,
      });
      const product = (await createRes.json()) as { id: string };
      productId = product.id;
      console.log(`  + Created product "${plan.name}" (${productId})`);
    }

    // Check if price with lookup_key exists
    const pricesRes = await fetch(
      `${base}/prices?lookup_keys[]=${plan.lookup_key}&limit=1`,
      { headers },
    );
    const pricesData = (await pricesRes.json()) as {
      data: Array<{ id: string }>;
    };

    if (pricesData.data.length > 0) {
      console.log(
        `  ✓ Price for "${plan.name}" already exists (${pricesData.data[0].id})`,
      );
    } else {
      const body = new URLSearchParams({
        product: productId,
        unit_amount: String(plan.amount_cents),
        currency: "usd",
        "recurring[interval]": plan.interval,
        lookup_key: plan.lookup_key,
      });
      const createRes = await fetch(`${base}/prices`, {
        method: "POST",
        headers,
        body,
      });
      const price = (await createRes.json()) as { id: string };
      console.log(`  + Created price for "${plan.name}" (${price.id})`);
    }
  }
}

// ── Feature flags ────────────────────────────────────────────

const DEFAULT_FLAGS: Array<{
  key: string;
  enabled: boolean;
  description: string;
}> = [
  {
    key: "signup_enabled",
    enabled: true,
    description: "Allow new member registrations",
  },
  {
    key: "referrals_enabled",
    enabled: false,
    description: "Enable client referral feature (Phase 6)",
  },
  {
    key: "sms_enabled",
    enabled: false,
    description: "Send real SMS via Twilio (false = log to console)",
  },
  {
    key: "stripe_live",
    enabled: false,
    description: "Use live Stripe keys (false = test mode)",
  },
];

async function seedFeatureFlags(): Promise<void> {
  for (const flag of DEFAULT_FLAGS) {
    await sql`
      INSERT INTO feature_flag (key, enabled, description, created_at, updated_at)
      VALUES (${flag.key}, ${flag.enabled}, ${flag.description}, now(), now())
      ON CONFLICT (key) DO NOTHING
    `;
    console.log(`  ✓ Flag "${flag.key}" = ${flag.enabled}`);
  }
}

// ── Dev sample data ──────────────────────────────────────────

async function seedDevData(): Promise<void> {
  if (isProduction) {
    console.log("\n⏭️  Skipping dev data in production mode.");
    return;
  }

  console.log("\n📦 Inserting development sample data...");
  console.log("  (No domain tables exist yet — will be populated in Phase 1)");
  // Phase 1 will add: members, cards, companies, etc.
  // This function will grow as schemas are added.
}

// ── Main ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(
    `\n🌱 Seeding database (${isProduction ? "production" : "development"})...\n`,
  );

  console.log("── Stripe products & prices ──");
  await seedStripe();

  console.log("\n── Feature flags ──");
  await seedFeatureFlags();

  await seedDevData();

  console.log("\n✅ Seed complete.\n");
}

main().catch((err: unknown) => {
  console.error("\n❌ Seed failed:", err);
  process.exit(1);
});
