import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import type { Db, DbClient } from "@/data/db.js";
import { getTestDb } from "./setup/integration-setup.js";
import {
  reconcileSubscription,
  BILLING_OUTBOX_TOPIC,
} from "@/modules/billing/projection.js";
import { findLapsedSubscriptions, processWebhookOnce } from "@/data/billing.js";
import { enqueueOutbox, countPending } from "@/data/outbox.js";
import { cards, members } from "@/data/schema/index.js";

/**
 * The integration harness uses the node-postgres driver, while the data layer
 * is typed against the Neon driver. Both expose the same Drizzle API; this is
 * the one boundary where the drivers meet.
 */
function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

/** processWebhookOnce needs the full neon Db shape ($client and all). */
function testDb(): Db {
  return getTestDb() as unknown as Db;
}

const EPOCH = 1_750_000_000;

/** Mirrors Stripe's resource_missing error code (projection isResourceMissing). */
class ResourceMissingError extends Error {
  code = "resource_missing";
}

/** Minimal Stripe.Subscription fixture; fields outside the fold are undefined. */
function subscriptionFixture(
  memberId: string,
  overrides: Partial<Stripe.Subscription> = {},
): Stripe.Subscription {
  return {
    id: "sub_test",
    customer: "cus_test",
    status: "active",
    metadata: { memberId },
    items: {
      data: [
        {
          price: { id: "price_vip_monthly" },
          current_period_start: EPOCH,
          current_period_end: EPOCH + 2_592_000,
        } as Stripe.SubscriptionItem,
      ],
    } as Stripe.ApiList<Stripe.SubscriptionItem>,
    cancel_at_period_end: false,
    canceled_at: null,
    ...overrides,
  } as unknown as Stripe.Subscription;
}

async function seedMemberAndCard(db: DbClient, memberId: string) {
  await db.insert(members).values({
    id: memberId,
    phone: `+1${Math.floor(1_000_000_000 + Math.random() * 9_000_000_000)}`,
    passwordHash: "hash",
    displayName: "Test Member",
    country: "US",
    language: "en",
  });
  await db.insert(cards).values({
    memberId,
    serial: `KCLUB-${Math.floor(100_000 + Math.random() * 900_000)}`,
    token: `tok-${crypto.randomUUID()}`,
    tier: "free",
  });
}

async function cardTierOf(db: DbClient, memberId: string) {
  const rows = await db
    .select()
    .from(cards)
    .where(eq(cards.memberId, memberId));
  return rows[0]?.tier;
}

describe("billing projection (ADR 0004)", () => {
  it("FR-052: an active subscription projects the vip tier onto the member's card", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);

    const result = await reconcileSubscription(
      db,
      () =>
        Promise.resolve(subscriptionFixture(memberId, { id: subscriptionId })),
      subscriptionId,
      EPOCH,
    );

    expect(result).toBe("applied");
    expect(await cardTierOf(db, memberId)).toBe("vip");
  });

  it("FR-052: a cancelled subscription demotes the tier to free", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);

    await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          subscriptionFixture(memberId, {
            id: subscriptionId,
            status: "active",
          }),
        ),
      subscriptionId,
      EPOCH,
    );
    const result = await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          subscriptionFixture(memberId, {
            id: subscriptionId,
            status: "canceled",
          }),
        ),
      subscriptionId,
      EPOCH + 60,
    );

    expect(result).toBe("applied");
    expect(await cardTierOf(db, memberId)).toBe("free");
  });

  it("FR-052: the entitlement comes from the re-fetched subscription, not the caller", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);

    // The fetcher returns an active subscription; the projection must reflect
    // that state even though nothing about it is known at the call site.
    const result = await reconcileSubscription(
      db,
      () =>
        Promise.resolve(subscriptionFixture(memberId, { id: subscriptionId })),
      subscriptionId,
      EPOCH,
    );

    expect(result).toBe("applied");
    expect(await cardTierOf(db, memberId)).toBe("vip");
  });

  it("FR-053: the same event delivered twice is processed exactly once", async () => {
    const db = testDbClient();
    const eventId = `evt_${crypto.randomUUID()}`;

    const handler = async (
      tx: Parameters<Parameters<typeof processWebhookOnce>[3]>[0],
    ) => {
      await enqueueOutbox(tx, BILLING_OUTBOX_TOPIC, { eventId });
    };

    const first = await processWebhookOnce(
      testDb(),
      eventId,
      "customer.subscription.created",
      handler,
    );
    const second = await processWebhookOnce(
      testDb(),
      eventId,
      "customer.subscription.created",
      handler,
    );

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(await countPending(db)).toBe(1);
  });

  it("FR-053: an older event arriving after a newer one is discarded (watermark)", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);

    const newer = await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          subscriptionFixture(memberId, {
            id: subscriptionId,
            status: "canceled",
          }),
        ),
      subscriptionId,
      EPOCH + 1000,
    );
    const older = await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          subscriptionFixture(memberId, {
            id: subscriptionId,
            status: "active",
          }),
        ),
      subscriptionId,
      EPOCH,
    );

    expect(newer).toBe("applied");
    expect(older).toBe("stale");
    // The stale event must not regress the cancelled state.
    expect(await cardTierOf(db, memberId)).toBe("free");
  });

  it("FR-050: a checkout redirect (success URL) grants no entitlement by itself", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    const eventId = `evt_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);

    // Simulate what happens when a checkout completes: the webhook fires,
    // processWebhookOnce records the event, and an outbox row is written.
    // The success redirect happens at the same time but is a separate path.
    await processWebhookOnce(
      testDb(),
      eventId,
      "customer.subscription.created",
      async (tx) => {
        await enqueueOutbox(tx, BILLING_OUTBOX_TOPIC, {
          eventId,
          eventCreated: EPOCH,
          subscriptionId,
        });
      },
    );

    // At this point the member lands on /checkout/success. The page renders a
    // "payment received" message but never calls reconcileSubscription. The
    // card tier must still be free — the entitlement only arrives when the
    // outbox-drain worker runs the projection.
    expect(await cardTierOf(db, memberId)).toBe("free");

    // Only after the projection worker runs does the tier change.
    const result = await reconcileSubscription(
      db,
      () =>
        Promise.resolve(subscriptionFixture(memberId, { id: subscriptionId })),
      subscriptionId,
      EPOCH,
    );
    expect(result).toBe("applied");
    expect(await cardTierOf(db, memberId)).toBe("vip");
  });

  it("FR-053: a deleted subscription is marked deleted and demotes the tier", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);

    await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          subscriptionFixture(memberId, {
            id: subscriptionId,
            status: "active",
          }),
        ),
      subscriptionId,
      EPOCH,
    );

    const result = await reconcileSubscription(
      db,
      () => Promise.reject(new ResourceMissingError()),
      subscriptionId,
      EPOCH + 2000,
    );

    expect(result).toBe("deleted");
    expect(await cardTierOf(db, memberId)).toBe("free");
  });
});

describe("billing lapse semantics (FR-054)", () => {
  it("a cancel-at-period-end subscription keeps vip while the period is active", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);

    await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          subscriptionFixture(memberId, {
            id: subscriptionId,
            status: "active",
            cancel_at_period_end: true,
            cancel_at: EPOCH + 2_592_000,
          }),
        ),
      subscriptionId,
      EPOCH,
    );

    expect(await cardTierOf(db, memberId)).toBe("vip");
  });

  it("findLapsedSubscriptions returns subscriptions past their period end", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);

    await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          subscriptionFixture(memberId, {
            id: subscriptionId,
            status: "active",
            cancel_at_period_end: true,
            cancel_at: EPOCH + 2_592_000,
          }),
        ),
      subscriptionId,
      EPOCH,
    );

    const beforeEnd = new Date(EPOCH * 1000);
    const beforeResults = await findLapsedSubscriptions(db, beforeEnd);
    expect(
      beforeResults.some((r) => r.stripeSubscriptionId === subscriptionId),
    ).toBe(false);

    const afterEnd = new Date((EPOCH + 2_592_000 + 60) * 1000);
    const lapsed = await findLapsedSubscriptions(db, afterEnd);
    expect(lapsed.some((r) => r.stripeSubscriptionId === subscriptionId)).toBe(
      true,
    );
  });

  it("the lapse cron path revokes access when Stripe confirms cancellation", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);

    // Initial active subscription with cancel_at_period_end.
    await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          subscriptionFixture(memberId, {
            id: subscriptionId,
            status: "active",
            cancel_at_period_end: true,
            cancel_at: EPOCH + 2_592_000,
          }),
        ),
      subscriptionId,
      EPOCH,
    );
    expect(await cardTierOf(db, memberId)).toBe("vip");

    // After the period ends, findLapsedSubscriptions finds it, and the cron
    // re-fetches from Stripe. Stripe now reports status: "canceled".
    const afterPeriodEnd = EPOCH + 2_592_000 + 120;
    const result = await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          subscriptionFixture(memberId, {
            id: subscriptionId,
            status: "canceled",
            canceled_at: EPOCH + 2_592_000,
          }),
        ),
      subscriptionId,
      afterPeriodEnd,
    );

    expect(result).toBe("applied");
    expect(await cardTierOf(db, memberId)).toBe("free");
  });

  it("a renewed subscription (Stripe auto-renewed) keeps vip after the lapse check", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);

    await reconcileSubscription(
      db,
      () =>
        Promise.resolve(subscriptionFixture(memberId, { id: subscriptionId })),
      subscriptionId,
      EPOCH,
    );

    // The lapse cron re-fetches and Stripe says it auto-renewed with a new
    // period. The subscription is still active — access stays.
    const afterPeriodEnd = EPOCH + 2_592_000 + 120;
    const result = await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          subscriptionFixture(memberId, {
            id: subscriptionId,
            status: "active",
            items: {
              data: [
                {
                  price: { id: "price_vip_monthly" },
                  current_period_start: EPOCH + 2_592_000,
                  current_period_end: EPOCH + 5_184_000,
                } as unknown as Stripe.SubscriptionItem,
              ],
            } as Stripe.ApiList<Stripe.SubscriptionItem>,
          }),
        ),
      subscriptionId,
      afterPeriodEnd,
    );

    expect(result).toBe("applied");
    expect(await cardTierOf(db, memberId)).toBe("vip");
  });
});
