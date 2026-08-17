import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import pg from "pg";
import type { Db, DbClient } from "@/data/db.js";
import {
  findActiveSubscriptionByPrice,
  findActiveVipSubscription,
} from "@/data/billing.js";
import {
  findActivePlanPrice,
  listPlanPrices,
  setActivePlanPrice,
} from "@/data/plan-prices.js";
import { cards, members, subscriptions } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

function testDb(): Db {
  return getTestDb() as unknown as Db;
}

async function seedMember(
  db: DbClient,
  role: "staff_owner" | "member" = "staff_owner",
) {
  const [member] = await db
    .insert(members)
    .values({
      phone: `+1555${Math.floor(1_000_000 + Math.random() * 8_000_000)}`,
      passwordHash: "hash",
      displayName: "Plan Price Staff",
      country: "US",
      language: "en",
      role,
    })
    .returning();

  return member!;
}

describe("plan price management (FR-059)", () => {
  it("stores the active database price for new checkout sessions", async () => {
    const db = testDbClient();
    const owner = await seedMember(db);

    await setActivePlanPrice(testDb(), "vip", "price_vip_new", owner.id);

    await expect(findActivePlanPrice(db, "vip")).resolves.toBe("price_vip_new");
  });

  it("keeps old prices as inactive history when staff_owner changes a plan price", async () => {
    const db = testDbClient();
    const owner = await seedMember(db);

    await setActivePlanPrice(
      testDb(),
      "listing",
      "price_listing_old",
      owner.id,
    );
    await setActivePlanPrice(
      testDb(),
      "listing",
      "price_listing_new",
      owner.id,
    );

    const rows = await listPlanPrices(db, "listing");
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.active)).toHaveLength(1);
    expect(rows.find((row) => row.active)?.stripePriceId).toBe(
      "price_listing_new",
    );
    expect(rows.find((row) => !row.active)?.stripePriceId).toBe(
      "price_listing_old",
    );
  });

  it("does not make existing VIP subscriptions depend on the current price id", async () => {
    const db = testDbClient();
    const owner = await seedMember(db);
    const member = await seedMember(db, "member");

    await db.insert(cards).values({
      memberId: member.id,
      serial: `KCLUB-${Math.floor(100_000 + Math.random() * 900_000)}`,
      token: `tok-${crypto.randomUUID()}`,
      tier: "vip",
    });
    await db.insert(subscriptions).values({
      stripeSubscriptionId: `sub_${crypto.randomUUID()}`,
      memberId: member.id,
      stripeCustomerId: `cus_${crypto.randomUUID()}`,
      status: "active",
      priceId: "price_vip_old",
      currentPeriodStart: new Date("2026-08-01T00:00:00Z"),
      currentPeriodEnd: new Date("2026-09-01T00:00:00Z"),
    });

    await setActivePlanPrice(testDb(), "vip", "price_vip_new", owner.id);

    await expect(
      findActiveSubscriptionByPrice(db, member.id, "price_vip_new"),
    ).resolves.toBeUndefined();
    await expect(
      findActiveVipSubscription(db, member.id),
    ).resolves.toMatchObject({
      memberId: member.id,
      priceId: "price_vip_old",
    });

    const rows = await db
      .select({ priceId: subscriptions.priceId })
      .from(subscriptions)
      .where(eq(subscriptions.memberId, member.id));
    expect(rows).toEqual([{ priceId: "price_vip_old" }]);
  });
});

describe("integration test harness: nested db.transaction() does not leak", () => {
  it("keeps setActivePlanPrice's write invisible to a second, independent connection", async () => {
    const db = testDbClient();
    const owner = await seedMember(db);
    const stripePriceId = `price_leak_check_${crypto.randomUUID()}`;

    // setActivePlanPrice opens its own db.transaction() internally. If that
    // nested transaction ever silently commits the outer per-test
    // transaction (the bug this test guards against), this write becomes
    // visible outside the test's own connection before afterEach runs.
    await setActivePlanPrice(testDb(), "vip", stripePriceId, owner.id);

    const outsideClient = new pg.Client({
      connectionString: process.env["TEST_DATABASE_URL"],
    });
    await outsideClient.connect();
    try {
      const result = await outsideClient.query(
        "SELECT 1 FROM plan_prices WHERE stripe_price_id = $1",
        [stripePriceId],
      );
      expect(result.rows).toHaveLength(0);
    } finally {
      await outsideClient.end();
    }
  });
});
