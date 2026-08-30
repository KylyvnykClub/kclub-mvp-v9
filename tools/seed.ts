/**
 * Database seed script.
 *
 * Usage:
 *   pnpm db:seed              — seed the local/preview database
 *   pnpm db:seed --production — seed production (staff user only, no test data)
 *   pnpm db:seed:beta         — beta seed: 50 members + 30 partner listings
 *
 * What it does:
 *   1. Ensures Stripe products and prices exist (VIP membership, listing subscription).
 *   2. Inserts the feature flags the application reads and the migrations do
 *      not seed; never changes an existing row (the staff console owns those).
 *   3. Creates a bootstrap staff user (from ADMIN_BOOTSTRAP_OWNER_PHONE / PASSWORD).
 *   4. Records the Stripe prices from step 1 in plan_prices when nothing is
 *      active there yet, so a fresh branch can check out without STRIPE_*_PRICE_ID.
 *   5. With --beta: seeds the Private Beta dataset (phase 4, requirements.md §6.1).
 *
 * Idempotent: safe to run multiple times. Uses ON CONFLICT DO NOTHING.
 *
 * Beta seed note (ADR 0004): partner listing entitlements are normally
 * projected from Stripe webhooks. The beta seed inserts synthetic
 * subscription rows directly (sub_seed_beta_*) as a documented seed-only
 * exception so the catalogue is browsable on staging without 30 real
 * Stripe checkout flows. Production entitlements never come from this path.
 */

import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

import type { DatabaseMarker } from "../src/data/database-environment";
import { FLAG_NAMES } from "../src/data/feature-flags";
import { assertDatabaseEnvironment } from "./assert-database-environment";
import { betaSeedRefusal } from "./beta-seed-guard";
import { SEED_FLAG_DEFAULTS } from "./seed-defaults";

config({ path: ".env.local" });

// ── Configuration ────────────────────────────────────────────

const isProduction = process.argv.includes("--production");
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set. Copy .env.example to .env.local.");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

/** Set by main() from the marker check, before any seed function runs. */
let databaseMarker: DatabaseMarker = { kind: "no_table" };

// ── Stripe seed ──────────────────────────────────────────────

type PlanLookupKey = "vip_monthly" | "listing_monthly";

interface StripePlan {
  name: string;
  lookup_key: PlanLookupKey;
  amount_cents: number;
  interval: "month";
}

/** Stripe price ids found or created by seedStripe(), by lookup key. */
type SeededPriceIds = Partial<Record<PlanLookupKey, string>>;

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

async function seedStripe(): Promise<SeededPriceIds> {
  const priceIds: SeededPriceIds = {};
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY.includes("placeholder")) {
    console.warn(
      "⚠️  STRIPE_SECRET_KEY not set or is placeholder — skipping Stripe seed.",
    );
    return priceIds;
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
      productId = searchData.data[0]!.id;
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
      priceIds[plan.lookup_key] = pricesData.data[0]!.id;
      console.log(
        `  ✓ Price for "${plan.name}" already exists (${pricesData.data[0]!.id})`,
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
      priceIds[plan.lookup_key] = price.id;
      console.log(`  + Created price for "${plan.name}" (${price.id})`);
    }
  }

  return priceIds;
}

// ── Feature flags ────────────────────────────────────────────

/**
 * Insert the flags the application reads and this database lacks. Existing
 * rows are never updated: a flag a staff owner flipped in the console stays
 * flipped across seeds.
 */
async function seedFeatureFlags(): Promise<void> {
  for (const name of FLAG_NAMES) {
    const enabled = SEED_FLAG_DEFAULTS[name];
    const inserted = await sql`
      INSERT INTO feature_flag (name, enabled, updated_at)
      VALUES (${name}, ${enabled}, now())
      ON CONFLICT (name) DO NOTHING
      RETURNING name
    `;
    console.log(
      inserted.length > 0
        ? `  + Flag "${name}" = ${enabled}`
        : `  ✓ Flag "${name}" already present — left as is`,
    );
  }
}

// ── Bootstrap staff owner ────────────────────────────────────

/** Returns the staff owner's member id, existing or created; null if skipped. */
async function seedBootstrapStaff(): Promise<string | null> {
  const phone = process.env.ADMIN_BOOTSTRAP_OWNER_PHONE;
  const password = process.env.ADMIN_BOOTSTRAP_OWNER_PASSWORD;

  if (!phone || !password) {
    console.log(
      "\n⏭️  Skipping staff bootstrap (ADMIN_BOOTSTRAP_OWNER_PHONE / ADMIN_BOOTSTRAP_OWNER_PASSWORD not set).",
    );
    return null;
  }

  if (password.length < 12) {
    console.error(
      "\n❌ ADMIN_BOOTSTRAP_OWNER_PASSWORD must be at least 12 characters (staff password policy).",
    );
    process.exit(1);
  }

  console.log("\n👑 Bootstrapping staff owner...");

  const { db } = await import("../src/data/db");
  const { members } = await import("../src/data/schema");
  const { hashPassword } = await import("../src/modules/identity/crypto");
  const { eq } = await import("drizzle-orm");

  const displayName = process.env.ADMIN_BOOTSTRAP_OWNER_NAME ?? "Owner";
  const country = process.env.ADMIN_BOOTSTRAP_OWNER_COUNTRY ?? "US";
  const language = process.env.ADMIN_BOOTSTRAP_OWNER_LANGUAGE ?? "en";

  const inserted = await db
    .insert(members)
    .values({
      phone,
      passwordHash: await hashPassword(password),
      displayName,
      role: "staff_owner",
      country,
      language,
      status: "active",
    })
    .onConflictDoNothing({ target: members.phone })
    .returning({ id: members.id });

  if (inserted.length === 0) {
    console.log(`  ✓ Staff owner already exists for ${phone} — skipped.`);
    const existing = await db.query.members.findFirst({
      where: eq(members.phone, phone),
      columns: { id: true },
    });
    return existing?.id ?? null;
  }

  console.log(`  + Created staff owner "${displayName}" (${phone}).`);
  console.log(
    "  ⚠️  Remove ADMIN_BOOTSTRAP_OWNER_PASSWORD from the environment now that bootstrap is done.",
  );
  return inserted[0]!.id;
}

// ── Plan prices ──────────────────────────────────────────────

/**
 * Checkout reads plan_prices before STRIPE_*_PRICE_ID (src/modules/billing/
 * prices.ts). A fresh branch has no row, so record the prices seedStripe()
 * just found or created. An existing active row is the staff console's
 * (FR-059) and is left alone even when it differs — a warning says so.
 */
async function seedPlanPrices(
  priceIds: SeededPriceIds,
  ownerId: string | null,
): Promise<void> {
  const plans = [
    { plan: "vip", priceId: priceIds.vip_monthly },
    { plan: "listing", priceId: priceIds.listing_monthly },
  ] as const;

  if (plans.every((entry) => !entry.priceId)) {
    console.log("  ⏭️  No Stripe prices seeded — nothing to record.");
    return;
  }
  if (!ownerId) {
    console.warn(
      "  ⚠️  No staff owner to attribute plan prices to — skipping (set ADMIN_BOOTSTRAP_OWNER_*).",
    );
    return;
  }

  const { db } = await import("../src/data/db");
  const { findActivePlanPrice, setActivePlanPrice } =
    await import("../src/data/plan-prices");

  for (const { plan, priceId } of plans) {
    if (!priceId) continue;
    const active = await findActivePlanPrice(db, plan);
    if (active === priceId) {
      console.log(`  ✓ ${plan}: ${priceId} already active`);
    } else if (active) {
      console.warn(
        `  ⚠️  ${plan}: ${active} is active in plan_prices, Stripe seed has ${priceId} — left as is (change it in the staff console)`,
      );
    } else {
      await setActivePlanPrice(db, plan, priceId, ownerId);
      console.log(`  + ${plan}: ${priceId} recorded`);
    }
  }
}

// ── Beta seed (phase 4, requirements.md §6.1) ────────────────

const isBeta = process.argv.includes("--beta");

const BETA_FIRST_NAMES = [
  "Olena",
  "Dmytro",
  "Iryna",
  "Andrii",
  "Kateryna",
  "Serhii",
  "Yulia",
  "Oleksandr",
  "Natalia",
  "Viktor",
  "Tetiana",
  "Maksym",
  "Svitlana",
  "Ihor",
  "Liudmyla",
  "Pavlo",
  "Oksana",
  "Roman",
  "Halyna",
  "Bohdan",
  "Mariia",
  "Vasyl",
  "Anastasiia",
  "Kostiantyn",
  "Zoryana",
];

const BETA_LAST_NAMES = [
  "Shevchenko",
  "Bondarenko",
  "Kovalenko",
  "Tkachenko",
  "Melnyk",
  "Boyko",
  "Kravchenko",
  "Oliynyk",
  "Lysenko",
  "Savchenko",
  "Rudenko",
  "Marchenko",
  "Hrytsenko",
  "Pavlenko",
  "Klymenko",
  "Moroz",
  "Koval",
  "Bondar",
  "Polishchuk",
  "Tymoshenko",
  "Nazarenko",
  "Havryliuk",
  "Demydenko",
  "Zinchenko",
  "Litvin",
];

const BETA_COMPANIES = [
  {
    name: "TechNova Solutions",
    description:
      "Custom software development and cloud infrastructure consulting for growing businesses.",
    discount: "15% off for KCLUB members",
    categoryHint: "IT",
  },
  {
    name: "GreenLeaf Organics",
    description:
      "Organic food production and distribution with a focus on sustainable farming.",
    discount: "10% off first order for KCLUB members",
    categoryHint: "Food",
  },
  {
    name: "Atlas Logistics",
    description:
      "International freight forwarding and supply chain management services.",
    discount: "Free consultation for KCLUB members",
    categoryHint: "Logistics",
  },
  {
    name: "BrightPath Education",
    description:
      "Professional development courses and corporate training programs.",
    discount: "20% off courses for KCLUB members",
    categoryHint: "Education",
  },
  {
    name: "Summit Financial",
    description: "Accounting, tax advisory, and financial planning for SMEs.",
    discount: "15% off advisory services for KCLUB members",
    categoryHint: "Finance",
  },
  {
    name: "Nordic Design Studio",
    description:
      "Brand identity, UX/UI design, and creative direction for digital products.",
    discount: "10% off design projects for KCLUB members",
    categoryHint: "Design",
  },
  {
    name: "Velocity Motors",
    description:
      "Premium car dealership and after-sales service with flexible leasing.",
    discount: "5% off service packages for KCLUB members",
    categoryHint: "Automotive",
  },
  {
    name: "HarborView Realty",
    description:
      "Commercial and residential real estate advisory across major cities.",
    discount: "Reduced commission for KCLUB members",
    categoryHint: "Real Estate",
  },
  {
    name: "PureWell Clinic",
    description:
      "Private medical clinic offering preventive care and executive health checks.",
    discount: "15% off health checks for KCLUB members",
    categoryHint: "Health",
  },
  {
    name: "CraftBrew Collective",
    description:
      "Artisanal brewery with taproom events and wholesale distribution.",
    discount: "Free tasting for KCLUB members",
    categoryHint: "Food",
  },
  {
    name: "Skyline Construction",
    description:
      "General contracting and renovation for commercial and residential projects.",
    discount: "10% off project estimates for KCLUB members",
    categoryHint: "Construction",
  },
  {
    name: "Lumen Media Group",
    description:
      "Full-service digital marketing, SEO, and content production agency.",
    discount: "15% off retainers for KCLUB members",
    categoryHint: "Marketing",
  },
  {
    name: "EverGreen Energy",
    description: "Solar panel installation and renewable energy consulting.",
    discount: "Free site assessment for KCLUB members",
    categoryHint: "Energy",
  },
  {
    name: "Cobalt Legal",
    description:
      "Corporate law, contract drafting, and cross-border transaction support.",
    discount: "10% off legal fees for KCLUB members",
    categoryHint: "Legal",
  },
  {
    name: "Aurora Travel",
    description: "Bespoke travel planning and corporate retreat organization.",
    discount: "8% off packages for KCLUB members",
    categoryHint: "Travel",
  },
  {
    name: "Ironclad Security",
    description:
      "Physical and cybersecurity services for enterprises and events.",
    discount: "Free risk assessment for KCLUB members",
    categoryHint: "Security",
  },
  {
    name: "Verde Agriculture",
    description: "Modern farming equipment supply and agronomy consulting.",
    discount: "12% off equipment for KCLUB members",
    categoryHint: "Agriculture",
  },
  {
    name: "PixelForge Games",
    description: "Indie game development studio and interactive entertainment.",
    discount: "Early access for KCLUB members",
    categoryHint: "IT",
  },
  {
    name: "Sterling Insurance",
    description: "Business insurance, liability coverage, and risk management.",
    discount: "10% off premiums for KCLUB members",
    categoryHint: "Finance",
  },
  {
    name: "Cascade Water Systems",
    description: "Water purification and industrial filtration solutions.",
    discount: "15% off installation for KCLUB members",
    categoryHint: "Manufacturing",
  },
  {
    name: "Horizon Ventures",
    description:
      "Venture capital and startup advisory for early-stage founders.",
    discount: "Priority intro calls for KCLUB members",
    categoryHint: "Finance",
  },
  {
    name: "TerraCotta Ceramics",
    description: "Handmade ceramics studio with wholesale and custom orders.",
    discount: "20% off wholesale for KCLUB members",
    categoryHint: "Manufacturing",
  },
  {
    name: "Quantum Analytics",
    description:
      "Data science consulting and business intelligence dashboards.",
    discount: "15% off projects for KCLUB members",
    categoryHint: "IT",
  },
  {
    name: "Fjord Seafood",
    description:
      "Premium seafood import and distribution to restaurants and retail.",
    discount: "10% off bulk orders for KCLUB members",
    categoryHint: "Food",
  },
  {
    name: "Apex Fitness",
    description:
      "Boutique fitness studio with personal training and corporate wellness.",
    discount: "Free trial month for KCLUB members",
    categoryHint: "Health",
  },
  {
    name: "Solstice Events",
    description: "Conference production, venue management, and event catering.",
    discount: "10% off venue hire for KCLUB members",
    categoryHint: "Events",
  },
  {
    name: "Redwood Furniture",
    description:
      "Custom furniture manufacturing and interior fit-out services.",
    discount: "15% off custom orders for KCLUB members",
    categoryHint: "Manufacturing",
  },
  {
    name: "Nimbus Cloud Services",
    description:
      "Managed cloud hosting, DevOps, and infrastructure automation.",
    discount: "20% off first year for KCLUB members",
    categoryHint: "IT",
  },
  {
    name: "Golden Harvest Farms",
    description: "Grain production and agricultural commodity trading.",
    discount: "Market-rate pricing for KCLUB members",
    categoryHint: "Agriculture",
  },
  {
    name: "BluePeak Consulting",
    description:
      "Management consulting and operational excellence for mid-market firms.",
    discount: "15% off engagements for KCLUB members",
    categoryHint: "Consulting",
  },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function betaPhone(i: number): string {
  return `+380501${String(i).padStart(6, "0")}`;
}

function betaCardSerial(i: number): string {
  return `KCLUB-${String(100000 + i)}`;
}

function betaCardToken(i: number): string {
  return `beta-card-token-${String(i).padStart(4, "0")}`;
}

async function seedBetaData(): Promise<void> {
  if (!isBeta) return;

  // The guard here used to key off the --production CLI flag. But `pnpm
  // db:seed:beta` never passes that flag, so the flag reported "not production"
  // regardless of which database DATABASE_URL actually pointed at - and it once
  // seeded production, because a developer's .env.local held production
  // credentials. Decide from the environment and the database's own contents
  // instead (see tools/beta-seed-guard.ts). A database that already holds a
  // member outside the beta phone set is a real, shared, or production database;
  // the bootstrap staff owner is created earlier in this same run, so it is
  // excluded and does not make a fresh staging database look real.
  const guardBetaPhones = Array.from({ length: 50 }, (_, i) => betaPhone(i));
  const ownerPhone = process.env.ADMIN_BOOTSTRAP_OWNER_PHONE ?? "";
  const [contents] = (await sql`
    SELECT count(*)::int AS real_members
    FROM members
    WHERE NOT (phone = ANY(${guardBetaPhones}))
      AND phone <> ${ownerPhone}
  `) as [{ real_members: number }];

  const refusal = betaSeedRefusal({
    isProductionFlag: isProduction,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    realMemberCount: contents.real_members,
    marker: databaseMarker,
  });
  if (refusal) {
    console.error(`\n❌ Refusing to seed beta data. ${refusal}`);
    process.exit(1);
  }

  console.log("\n🎟️  Seeding beta data (50 members + 30 companies)...");

  const { db } = await import("../src/data/db");
  const {
    members,
    cards,
    legalAcceptances,
    companies,
    subscriptions,
    businessCategories,
    profiles,
  } = await import("../src/data/schema");
  const { hashPassword } = await import("../src/modules/identity/crypto");
  const { appendAuditEntry } = await import("../src/data/audit-log");
  const { eq, inArray } = await import("drizzle-orm");

  const passwordHash = await hashPassword("BetaMember2026!");

  const categories = await db.query.businessCategories.findMany({
    where: eq(businessCategories.status, "ACTIVE"),
  });

  if (categories.length === 0) {
    console.warn(
      "⚠️  No active business categories found. Run pnpm db:seed:categories first.",
    );
    return;
  }

  const categoryMap = new Map<string, number>();
  for (const cat of categories) {
    if (!categoryMap.has(cat.category)) {
      categoryMap.set(cat.category, cat.id);
    }
  }

  const categoryIds = Array.from(categoryMap.values());
  const fallbackCategoryId = categoryIds[0]!;

  let memberCount = 0;
  let companyCount = 0;

  for (let i = 0; i < 50; i++) {
    const phone = betaPhone(i);
    const displayName = `${BETA_FIRST_NAMES[i % BETA_FIRST_NAMES.length]} ${
      BETA_LAST_NAMES[i % BETA_LAST_NAMES.length]
    }`;

    const inserted = await db
      .insert(members)
      .values({
        phone,
        passwordHash,
        displayName,
        locale: "en",
        country: "UA",
        language: "en",
        status: "active",
        role: "user",
      })
      .onConflictDoNothing({ target: members.phone })
      .returning({ id: members.id });

    if (inserted.length === 0) {
      continue;
    }

    const memberId = inserted[0]!.id;
    memberCount++;

    await appendAuditEntry(db, {
      actorType: "member",
      actorId: memberId,
      action: "member.registered",
      subjectType: "member",
      subjectId: memberId,
      meta: { source: "beta_seed" },
    });

    await db
      .insert(cards)
      .values({
        memberId,
        serial: betaCardSerial(i),
        token: betaCardToken(i),
        tier: "free",
        status: "valid",
      })
      .onConflictDoNothing({ target: cards.serial });

    await db.insert(legalAcceptances).values([
      { memberId, documentId: "terms-of-use", version: "1.0" },
      { memberId, documentId: "privacy-policy", version: "1.0" },
      { memberId, documentId: "arbitration", version: "1.0" },
      { memberId, documentId: "age-verification", version: "1.0" },
    ]);

    await db
      .insert(profiles)
      .values({
        memberId,
        bio: `${displayName} is a member of KCLUB.`,
        industry: "Business",
        location: "Kyiv, Ukraine",
      })
      .onConflictDoNothing({ target: profiles.memberId });
  }

  console.log(`  ✓ Inserted ${memberCount} new members`);

  const betaPhones = Array.from({ length: 50 }, (_, i) => betaPhone(i));
  const betaMembers = await db.query.members.findMany({
    where: inArray(members.phone, betaPhones),
    orderBy: (m, { asc }) => [asc(m.phone)],
  });

  const memberIds = betaMembers.map((m) => m.id);

  if (memberIds.length === 0) {
    console.warn(
      "⚠️  No beta members found to own companies. Skipping companies.",
    );
    return;
  }

  for (const [i, company] of BETA_COMPANIES.entries()) {
    const slug = slugify(company.name);
    const ownerId = memberIds[i % memberIds.length]!;

    let categoryId = fallbackCategoryId;
    for (const [catName, catId] of categoryMap) {
      if (catName.toLowerCase().includes(company.categoryHint.toLowerCase())) {
        categoryId = catId;
        break;
      }
    }

    const inserted = await db
      .insert(companies)
      .values({
        ownerId,
        businessCategoryId: categoryId,
        name: company.name,
        slug,
        description: company.description,
        discount: company.discount,
        country: "Ukraine",
        city: "Kyiv",
        moderationStatus: "approved",
      })
      .onConflictDoNothing({ target: companies.slug })
      .returning({ id: companies.id });

    if (inserted.length === 0) {
      continue;
    }

    const companyId = inserted[0]!.id;
    companyCount++;

    const stripeSubId = `sub_seed_beta_${slug}`;
    const stripeCusId = `cus_seed_beta_${slug}`;

    const existingSub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.stripeSubscriptionId, stripeSubId),
    });

    if (!existingSub) {
      const now = new Date();
      const oneYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      await db.insert(subscriptions).values({
        stripeSubscriptionId: stripeSubId,
        memberId: ownerId,
        companyId,
        stripeCustomerId: stripeCusId,
        status: "active",
        priceId: "price_seed_beta_listing",
        currentPeriodStart: now,
        currentPeriodEnd: oneYear,
        stripeUpdatedAt: now,
      });
    }
  }

  console.log(`  ✓ Inserted ${companyCount} new companies`);
}

// ── Main ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(
    `\n🌱 Seeding database (${isProduction ? "production" : "development"})...\n`,
  );

  // ADR 0026: the database says which environment it is. A production marker
  // refuses unless this is the deliberate --production bootstrap run with the
  // incident-shell escape hatch set.
  databaseMarker = await assertDatabaseEnvironment({
    tool: isBeta ? "db:seed:beta" : "db:seed",
    productionFlag: isProduction,
  });

  console.log("\n── Stripe products & prices ──");
  const priceIds = await seedStripe();

  console.log("\n── Feature flags ──");
  await seedFeatureFlags();

  const ownerId = await seedBootstrapStaff();

  console.log("\n── Plan prices ──");
  await seedPlanPrices(priceIds, ownerId);

  await seedBetaData();

  console.log("\n✅ Seed complete.\n");
}

main().catch((err: unknown) => {
  console.error("\n❌ Seed failed:", err);
  process.exit(1);
});
