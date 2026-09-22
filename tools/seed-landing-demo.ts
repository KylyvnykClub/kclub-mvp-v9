/**
 * The landing page's demo dataset, for a local database only.
 *
 * The redesigned landing page reads everything it shows: the figures under the
 * hero, the three curated partner cards, the catalogue search and its filters.
 * On an empty database that is a page of empty sections - correct, and useless
 * for looking at. This fills it with the nine businesses the client's prototype
 * drew, so the page can be compared against the design side by side.
 *
 * Usage:
 *   pnpm db:seed:landing          — reference taxonomy + nine demo partners
 *   pnpm db:seed:landing --remove — take the demo partners out again
 *
 * Two deliberate departures from the other seeds, both documented here:
 *
 *   1. it speaks plain TCP through `pg` rather than Neon's driver, because the
 *      database it is for is the PostgreSQL container in docker-compose, which
 *      has no Neon HTTP endpoint for `assertDatabaseEnvironment` to read;
 *   2. it therefore reads the ADR 0026 marker itself, over the same connection,
 *      and refuses anything that does not say `dev`. There is no override flag
 *      and no --production: this writes invented businesses, and there is no
 *      circumstance in which invented businesses belong in a real catalogue.
 *
 * Idempotent: every write is an upsert keyed on the slug, so running it twice
 * changes nothing. `--remove` deletes exactly what it created and nothing else.
 *
 * ADR 0004 note: a published listing is normally entitled by a Stripe webhook.
 * This inserts a synthetic `sub_seed_landing_*` subscription row directly, the
 * same documented seed-only exception the beta seed takes, so the catalogue has
 * something in it without nine checkout flows. Production entitlements never
 * come from this path - which is also why this refuses to run against one.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });

const DATABASE_URL =
  process.env["DATABASE_URL_DIRECT"] ?? process.env["DATABASE_URL"];

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  process.exit(1);
}

const REMOVE = process.argv.includes("--remove");
const SLUG_PREFIX = "landing-demo-";

/**
 * The prototype's nine businesses.
 *
 * Their names, cities and offers are the client's own illustrative content, not
 * real partners - `DESIGN_RULES.md` says so in as many words. They exist to
 * prove the page reads its data, and they are labelled `landing-demo-` so that
 * nobody can mistake one for a partner who signed something.
 *
 * `block` is the English taxonomy block, which is what the card's colour, its
 * icon and the catalogue's `?block=` filter are all keyed on.
 */
type DemoPartner = {
  slug: string;
  name: string;
  description: string;
  discount: string;
  country: string;
  city: string;
  block: string;
  category: string;
  showcase: "top" | "none";
  rank: number;
  logoUrl?: string;
};

const PARTNERS: DemoPartner[] = [
  {
    slug: "swiss-legal-group",
    name: "Swiss Legal Group",
    description:
      "Corporate counsel, international contracts, and practical advice for doing business across borders.",
    discount: "Member consultation",
    country: "CH",
    city: "Zürich",
    block: "Legal, Finance & Security",
    category: "Law Firms & Attorneys",
    showcase: "top",
    rank: 0,
    logoUrl: "/brand/landing/partner-legal.jpg",
  },
  {
    slug: "grand-auto-premium",
    name: "Grand Auto Premium",
    description:
      "Personal vehicle sourcing and a considered buying experience, from first enquiry to handover.",
    discount: "Private sourcing",
    country: "CA",
    city: "Toronto",
    block: "Automotive, Transportation & Logistics",
    category: "Auto Dealerships",
    showcase: "top",
    rank: 1,
    logoUrl: "/brand/landing/partner-auto.jpg",
  },
  {
    slug: "noir-webcraft",
    name: "Noir Webcraft",
    description:
      "Digital products, thoughtful websites, and specialist development for growing businesses.",
    discount: "Project review",
    country: "US",
    city: "Los Angeles",
    block: "IT, Marketing, Design & Media",
    category: "Website Development & E-Commerce",
    showcase: "top",
    rank: 2,
    logoUrl: "/brand/landing/partner-tech.jpg",
  },
  {
    slug: "aurum-dental-care",
    name: "Aurum Dental Care",
    description: "Modern dentistry in the centre of Kyiv.",
    discount: "−10%",
    country: "UA",
    city: "Kyiv",
    block: "Healthcare, Health & Care",
    category: "Dentistry",
    showcase: "none",
    rank: 0,
  },
  {
    slug: "northline-fitness",
    name: "Northline Fitness",
    description: "Personal training and recovery programmes.",
    discount: "−15%",
    country: "US",
    city: "Miami",
    block: "Beauty, Fitness & Recovery",
    category: "Fitness Clubs",
    showcase: "none",
    rank: 0,
  },
  {
    slug: "atlas-journey",
    name: "Atlas Journey",
    description: "Curated international travel experiences.",
    discount: "VIP rate",
    country: "US",
    city: "New York",
    block: "Hospitality, Education & Personal Services",
    category: "Travel Agencies & Tour Operators",
    showcase: "none",
    rank: 0,
  },
  {
    slug: "maple-finance",
    name: "Maple Finance",
    description: "Financial planning for global founders.",
    discount: "Consultation",
    country: "CA",
    city: "Toronto",
    block: "Legal, Finance & Security",
    category: "Audit & Financial Control",
    showcase: "none",
    rank: 0,
  },
  {
    slug: "skyline-realty",
    name: "Skyline Realty",
    description: "Residential and investment property advice.",
    discount: "Priority",
    country: "US",
    city: "Miami",
    block: "Real Estate, Construction & Home Services",
    category: "Real Estate Agencies",
    showcase: "none",
    rank: 0,
  },
  {
    slug: "kyiv-business-bureau",
    name: "Kyiv Business Bureau",
    description: "Company setup, accounting, and local support.",
    discount: "−12%",
    country: "UA",
    city: "Kyiv",
    block: "Business & Professional Services",
    category: "Business Consulting",
    showcase: "none",
    rank: 0,
  },
];

/** Splits a CSV line on commas that are not inside quotes. */
function splitCsvLine(line: string): string[] {
  return line
    .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
    .map((part) => part.trim().replace(/^"|"$/g, "").replaceAll('""', '"'));
}

async function readCsv(file: string): Promise<string[][]> {
  const path = join(process.cwd(), "data", file);
  const content = await readFile(path, "utf-8");
  return content
    .split("\n")
    .filter((line) => line.trim() !== "")
    .slice(1)
    .map(splitCsvLine);
}

/**
 * Refuses any database that is not marked `dev` (ADR 0026).
 *
 * Stricter than `assertDatabaseEnvironment`, which warns for an unmarked
 * database and has a production override. Demo partners have no business in a
 * catalogue anyone reads, so "I am not sure what this database is" is a no.
 */
async function assertDevDatabase(client: pg.Client): Promise<void> {
  const exists = await client.query<{ oid: string | null }>(
    "select to_regclass('public.database_environment')::text as oid",
  );
  if (!exists.rows[0]?.oid) {
    console.error(
      "This database has no environment marker. Run the migrations first.",
    );
    process.exit(1);
  }

  const marker = await client.query<{ name: string }>(
    "select name from database_environment limit 1",
  );
  const name = marker.rows[0]?.name;

  if (name !== "dev") {
    console.error(
      `Refusing to continue: this database is marked "${name ?? "unmarked"}".` +
        " The landing demo dataset is for a development database only.",
    );
    process.exit(1);
  }

  console.log("MARKER: dev");
}

async function seedTaxonomy(client: pg.Client): Promise<void> {
  const [categories, translations] = await Promise.all([
    readCsv("business_categories.csv"),
    readCsv("business_category_translations.csv"),
  ]);

  for (const parts of categories) {
    if (parts.length !== 5) continue;
    await client.query(
      `insert into business_categories (id, block, category, subcategory, status)
       values ($1, $2, $3, $4, $5)
       on conflict (id) do update
         set block = excluded.block,
             category = excluded.category,
             subcategory = excluded.subcategory,
             status = excluded.status`,
      parts,
    );
  }

  for (const parts of translations) {
    if (parts.length !== 5) continue;
    await client.query(
      `insert into business_category_translations
         (business_category_id, locale, block, category, subcategory)
       values ($1, $2, $3, $4, $5)
       on conflict (business_category_id, locale) do update
         set block = excluded.block,
             category = excluded.category,
             subcategory = excluded.subcategory`,
      parts,
    );
  }

  console.log(
    `taxonomy: ${categories.length} categories, ${translations.length} translations`,
  );
}

async function removeDemo(client: pg.Client): Promise<void> {
  const { rowCount } = await client.query(
    "delete from companies where slug like $1",
    [`${SLUG_PREFIX}%`],
  );
  // company_categories, company_service_countries and subscriptions all cascade.
  console.log(`removed ${rowCount ?? 0} demo partners`);
}

async function seedPartners(client: pg.Client): Promise<void> {
  const owner = await client.query<{ id: string }>(
    "select id from members where deleted_at is null order by created_at limit 1",
  );
  const ownerId = owner.rows[0]?.id;

  if (!ownerId) {
    console.error(
      "No member to own the demo partners. Bring the stack up so the" +
        " fixtures are seeded, then run this again.",
    );
    process.exit(1);
  }

  for (const partner of PARTNERS) {
    const slug = `${SLUG_PREFIX}${partner.slug}`;

    const company = await client.query<{ id: string }>(
      `insert into companies
         (owner_id, name, slug, description, country, city,
          registration_country_code, discount, logo_url, moderation_status,
          showcase_type, showcase_rank, serves_worldwide)
       values ($1, $2, $3, $4, $5, $6, $5, $7, $8, 'approved', $9, $10, 0)
       on conflict (slug) do update
         set name = excluded.name,
             description = excluded.description,
             country = excluded.country,
             city = excluded.city,
             registration_country_code = excluded.registration_country_code,
             discount = excluded.discount,
             logo_url = excluded.logo_url,
             moderation_status = 'approved',
             showcase_type = excluded.showcase_type,
             showcase_rank = excluded.showcase_rank
       returning id`,
      [
        ownerId,
        partner.name,
        slug,
        partner.description,
        partner.country,
        partner.city,
        partner.discount,
        partner.logoUrl ?? null,
        partner.showcase,
        partner.rank,
      ],
    );

    const companyId = company.rows[0]!.id;

    const category = await client.query<{ id: number }>(
      `select id from business_categories
        where block = $1 and category = $2 and status = 'ACTIVE'
        order by id limit 1`,
      [partner.block, partner.category],
    );
    const categoryId = category.rows[0]?.id;

    if (!categoryId) {
      console.error(
        `No taxonomy row for ${partner.block} / ${partner.category}.` +
          " The catalogue CSVs and this file have drifted apart.",
      );
      process.exit(1);
    }

    await client.query(
      `insert into company_categories (company_id, business_category_id)
       values ($1, $2) on conflict do nothing`,
      [companyId, categoryId],
    );

    await client.query(
      `insert into company_service_countries (company_id, country_code)
       values ($1, $2) on conflict do nothing`,
      [companyId, partner.country],
    );

    // The seed-only entitlement (ADR 0004, see the file header).
    await client.query(
      `insert into subscriptions
         (stripe_subscription_id, member_id, company_id, stripe_customer_id,
          status, price_id, current_period_start, current_period_end, plan)
       values ($1, $2, $3, $4, 'active', 'price_seed_landing',
               now(), now() + interval '30 days', 'listing')
       on conflict (stripe_subscription_id) do nothing`,
      [
        `sub_seed_landing_${partner.slug}`,
        ownerId,
        companyId,
        `cus_seed_landing_${partner.slug}`,
      ],
    );
  }

  console.log(`partners: ${PARTNERS.length} published, 3 of them in Top`);
}

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    await assertDevDatabase(client);

    if (REMOVE) {
      await removeDemo(client);
      return;
    }

    await seedTaxonomy(client);
    await seedPartners(client);
    console.log("\nDone. The landing page now has something to read.");
  } finally {
    await client.end();
  }
}

await main();
