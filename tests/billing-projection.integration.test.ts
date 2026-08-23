import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import type { Db, DbClient } from "@/data/db.js";
import { getTestDb } from "./setup/integration-setup.js";
import {
  reconcileSubscription,
  BILLING_OUTBOX_TOPIC,
  BILLING_NOTIFICATION_TOPIC,
} from "@/modules/billing/projection.js";
import {
  BILLING_RECONCILIATION_ALERT_TOPIC,
  reconcileLocalSubscriptions,
  type ReconciliationAlertPayload,
} from "@/modules/billing/reconciliation.js";
import {
  listApprovedCompaniesByIds,
  listCompanyIdsWithActiveSubscription,
  listShowcaseCompanies,
  type PartnerCompanyView,
} from "@/data/companies.js";
import {
  findLapsedSubscriptions,
  findSubscriptionByStripeId,
  listAllSubscriptions,
  type AnySubscriptionRow,
  processWebhookOnce,
  setSubscriptionStatus,
} from "@/data/billing.js";
import {
  GRACE_EXPIRY_WARNING_NOTIFICATION,
  enqueueOutbox,
  countPending,
  drainOutbox,
} from "@/data/outbox.js";
import { runGraceExpiryWarningSweep } from "@/modules/billing/grace-warning.js";
import { handleStripeWebhook } from "@/modules/billing/stripe-webhook.js";
import {
  INLINE_BATCH_SIZE,
  runOutboxDrain,
} from "@/modules/platform/outbox-worker.js";
import {
  businessCategories,
  cards,
  companies,
  members,
  outbox,
} from "@/data/schema/index.js";

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

async function visibleCompanyIds(db: DbClient): Promise<string[]> {
  const ids = await listCompanyIdsWithActiveSubscription(db);
  if (ids.length === 0) return [];

  const companies = await listApprovedCompaniesByIds(db, ids);
  return companies.map((company: PartnerCompanyView) => company.id);
}

function subscriptionFixtureFromRow(
  row: AnySubscriptionRow,
  overrides: Partial<Stripe.Subscription> = {},
): Stripe.Subscription {
  return subscriptionFixture(row.memberId, {
    id: row.stripeSubscriptionId,
    customer: row.stripeCustomerId,
    status: row.status,
    metadata: {
      memberId: row.memberId,
      ...(row.companyId ? { companyId: row.companyId } : {}),
    },
    items: {
      data: [
        {
          price: { id: row.priceId },
          current_period_start: Math.floor(
            row.currentPeriodStart.getTime() / 1000,
          ),
          current_period_end: Math.floor(row.currentPeriodEnd.getTime() / 1000),
        } as Stripe.SubscriptionItem,
      ],
    } as Stripe.ApiList<Stripe.SubscriptionItem>,
    cancel_at_period_end: row.cancelAtPeriodEnd !== null,
    cancel_at: row.cancelAtPeriodEnd
      ? Math.floor(row.cancelAtPeriodEnd.getTime() / 1000)
      : null,
    canceled_at: row.canceledAt
      ? Math.floor(row.canceledAt.getTime() / 1000)
      : null,
    ...overrides,
  });
}

async function mirroredStripeFetcher(
  db: DbClient,
  overrides: Record<string, Partial<Stripe.Subscription>> = {},
) {
  const rows = await listAllSubscriptions(db);
  const fixtures = new Map(
    rows.map((row) => [
      row.stripeSubscriptionId,
      subscriptionFixtureFromRow(row, overrides[row.stripeSubscriptionId]),
    ]),
  );

  return (subscriptionId: string): Promise<Stripe.Subscription> => {
    const subscription = fixtures.get(subscriptionId);
    if (!subscription) return Promise.reject(new ResourceMissingError());
    return Promise.resolve(subscription);
  };
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

describe("billing grace period (FR-056)", () => {
  it("a past_due subscription keeps vip access during the dunning grace period", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);

    // Initially active.
    await reconcileSubscription(
      db,
      () =>
        Promise.resolve(subscriptionFixture(memberId, { id: subscriptionId })),
      subscriptionId,
      EPOCH,
    );
    expect(await cardTierOf(db, memberId)).toBe("vip");

    // Payment fails — Stripe sets status to past_due while retrying.
    const result = await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          subscriptionFixture(memberId, {
            id: subscriptionId,
            status: "past_due",
          }),
        ),
      subscriptionId,
      EPOCH + 60,
    );

    expect(result).toBe("applied");
    expect(await cardTierOf(db, memberId)).toBe("vip");
  });

  it("an unpaid subscription (grace expired) demotes to free", async () => {
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

    // All retries exhausted — Stripe sets status to unpaid.
    const result = await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          subscriptionFixture(memberId, {
            id: subscriptionId,
            status: "unpaid",
          }),
        ),
      subscriptionId,
      EPOCH + 14 * 86_400,
    );

    expect(result).toBe("applied");
    expect(await cardTierOf(db, memberId)).toBe("free");
  });

  it("invoice.payment_failed webhook writes a notification outbox row", async () => {
    const db = testDbClient();
    const eventId = `evt_${crypto.randomUUID()}`;
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    const customerId = `cus_${crypto.randomUUID()}`;

    await processWebhookOnce(
      testDb(),
      eventId,
      "invoice.payment_failed",
      async (tx) => {
        await enqueueOutbox(tx, BILLING_NOTIFICATION_TOPIC, {
          eventId,
          type: "payment_failed",
          subscriptionId,
          customerId,
          attemptCount: 1,
        });
      },
    );

    const entries = await drainOutbox(db, 10);
    const notificationEntry = entries.find(
      (e) => e.topic === BILLING_NOTIFICATION_TOPIC,
    );

    expect(notificationEntry).toBeDefined();
    const payload = notificationEntry!.payload as Record<string, unknown>;
    expect(payload.type).toBe("payment_failed");
    expect(payload.subscriptionId).toBe(subscriptionId);
    expect(payload.customerId).toBe(customerId);
  });

  it("a recovered payment (past_due → active) keeps vip", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);

    // Active → past_due.
    await reconcileSubscription(
      db,
      () =>
        Promise.resolve(subscriptionFixture(memberId, { id: subscriptionId })),
      subscriptionId,
      EPOCH,
    );
    await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          subscriptionFixture(memberId, {
            id: subscriptionId,
            status: "past_due",
          }),
        ),
      subscriptionId,
      EPOCH + 60,
    );

    // Payment recovered — Stripe sets back to active.
    const result = await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          subscriptionFixture(memberId, {
            id: subscriptionId,
            status: "active",
          }),
        ),
      subscriptionId,
      EPOCH + 300,
    );

    expect(result).toBe("applied");
    expect(await cardTierOf(db, memberId)).toBe("vip");
  });
});

describe("listing subscription projection (FR-051)", () => {
  async function seedCategory(db: DbClient) {
    const id = Math.floor(100_000 + Math.random() * 900_000);
    await db.insert(businessCategories).values({
      id,
      block: "Services",
      category: "Consulting",
      subcategory: `Billing ${id}`,
    });
    return id;
  }

  async function seedCompany(db: DbClient, ownerId: string) {
    const categoryId = await seedCategory(db);
    const [company] = await db
      .insert(companies)
      .values({
        ownerId,
        businessCategoryId: categoryId,
        name: "Test Listing Co",
        slug: `listing-${crypto.randomUUID()}`,
        moderationStatus: "approved",
      })
      .returning();
    return company!.id;
  }

  /** Fixture with companyId in metadata — a listing subscription. */
  function listingFixture(
    memberId: string,
    companyId: string,
    overrides: Partial<Stripe.Subscription> = {},
  ): Stripe.Subscription {
    return subscriptionFixture(memberId, {
      metadata: { memberId, companyId },
      ...overrides,
    });
  }

  it("FR-051: listing subscription stores companyId on the subscription row", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);
    const companyId = await seedCompany(db, memberId);

    const result = await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          listingFixture(memberId, companyId, { id: subscriptionId }),
        ),
      subscriptionId,
      EPOCH,
    );

    expect(result).toBe("applied");
    const row = await findSubscriptionByStripeId(db, subscriptionId);
    expect(row).toBeDefined();
    expect(row!.companyId).toBe(companyId);
    expect(row!.memberId).toBe(memberId);
  });

  it("FR-051: a listing subscription does not change the member's card tier", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);
    const companyId = await seedCompany(db, memberId);

    expect(await cardTierOf(db, memberId)).toBe("free");

    await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          listingFixture(memberId, companyId, { id: subscriptionId }),
        ),
      subscriptionId,
      EPOCH,
    );

    // Card tier must remain free — listing subscriptions do not grant VIP.
    expect(await cardTierOf(db, memberId)).toBe("free");
  });

  it("FR-051: a cancelled listing subscription does not demote an existing VIP tier", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const vipSubId = `sub_${crypto.randomUUID()}`;
    const listingSubId = `sub_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);
    const companyId = await seedCompany(db, memberId);

    // Member already has a VIP subscription.
    await reconcileSubscription(
      db,
      () => Promise.resolve(subscriptionFixture(memberId, { id: vipSubId })),
      vipSubId,
      EPOCH,
    );
    expect(await cardTierOf(db, memberId)).toBe("vip");

    // Active listing subscription — no tier change.
    await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          listingFixture(memberId, companyId, { id: listingSubId }),
        ),
      listingSubId,
      EPOCH,
    );
    expect(await cardTierOf(db, memberId)).toBe("vip");

    // Listing subscription cancelled — tier must stay vip (not demoted to free).
    await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          listingFixture(memberId, companyId, {
            id: listingSubId,
            status: "canceled",
          }),
        ),
      listingSubId,
      EPOCH + 60,
    );
    expect(await cardTierOf(db, memberId)).toBe("vip");
  });
});

describe("listing lifecycle projection (FR-055)", () => {
  async function seedCategory(db: DbClient) {
    const id = Math.floor(100_000 + Math.random() * 900_000);
    await db.insert(businessCategories).values({
      id,
      block: "Services",
      category: "Consulting",
      subcategory: `Lifecycle ${id}`,
    });
    return id;
  }

  async function seedCompany(
    db: DbClient,
    ownerId: string,
    moderationStatus: "approved" | "pending" | "rejected" = "approved",
  ) {
    const categoryId = await seedCategory(db);
    const [company] = await db
      .insert(companies)
      .values({
        ownerId,
        businessCategoryId: categoryId,
        name: "Lifecycle Listing Co",
        slug: `lifecycle-${crypto.randomUUID()}`,
        moderationStatus,
      })
      .returning();
    return company!.id;
  }

  function listingFixture(
    memberId: string,
    companyId: string,
    overrides: Partial<Stripe.Subscription> = {},
  ): Stripe.Subscription {
    return subscriptionFixture(memberId, {
      metadata: { memberId, companyId },
      ...overrides,
    });
  }

  it("FR-044/FR-055: approval plus an active listing subscription publishes the company", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);
    const companyId = await seedCompany(db, memberId);

    expect(await visibleCompanyIds(db)).not.toContain(companyId);

    await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          listingFixture(memberId, companyId, { id: subscriptionId }),
        ),
      subscriptionId,
      EPOCH,
    );

    expect(await visibleCompanyIds(db)).toContain(companyId);
  });

  it("FR-044: an unapproved company is not published even with an active listing subscription", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);
    const companyId = await seedCompany(db, memberId, "pending");

    await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          listingFixture(memberId, companyId, { id: subscriptionId }),
        ),
      subscriptionId,
      EPOCH,
    );

    expect(await visibleCompanyIds(db)).not.toContain(companyId);
  });

  it("FR-055/FR-056: past_due keeps the listing published during payment grace", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);
    const companyId = await seedCompany(db, memberId);

    await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          listingFixture(memberId, companyId, { id: subscriptionId }),
        ),
      subscriptionId,
      EPOCH,
    );

    const result = await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          listingFixture(memberId, companyId, {
            id: subscriptionId,
            status: "past_due",
          }),
        ),
      subscriptionId,
      EPOCH + 60,
    );

    expect(result).toBe("applied");
    expect(await visibleCompanyIds(db)).toContain(companyId);
  });

  it("FR-055: a lapsed listing subscription unpublishes and recovery republishes", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);
    const companyId = await seedCompany(db, memberId);

    await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          listingFixture(memberId, companyId, { id: subscriptionId }),
        ),
      subscriptionId,
      EPOCH,
    );
    expect(await visibleCompanyIds(db)).toContain(companyId);

    await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          listingFixture(memberId, companyId, {
            id: subscriptionId,
            status: "unpaid",
          }),
        ),
      subscriptionId,
      EPOCH + 14 * 86_400,
    );
    expect(await visibleCompanyIds(db)).not.toContain(companyId);

    await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          listingFixture(memberId, companyId, {
            id: subscriptionId,
            status: "active",
          }),
        ),
      subscriptionId,
      EPOCH + 14 * 86_400 + 60,
    );
    expect(await visibleCompanyIds(db)).toContain(companyId);
  });

  it("FR-055: deleted listing subscriptions are excluded from showcase publication", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);
    const companyId = await seedCompany(db, memberId);

    await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          listingFixture(memberId, companyId, { id: subscriptionId }),
        ),
      subscriptionId,
      EPOCH,
    );
    await reconcileSubscription(
      db,
      () => Promise.reject(new ResourceMissingError()),
      subscriptionId,
      EPOCH + 60,
    );

    const ids = await listCompanyIdsWithActiveSubscription(db);
    const showcasedTop =
      ids.length > 0 ? await listShowcaseCompanies(db, ids, "top", 3) : [];
    const showcasedFeatured =
      ids.length > 0 ? await listShowcaseCompanies(db, ids, "featured", 3) : [];
    const showcased = [...showcasedTop, ...showcasedFeatured];

    expect(showcased.map((company) => company.id)).not.toContain(companyId);
  });
});

describe("billing reconciliation (FR-058)", () => {
  it("does not alert when the local projection matches Stripe", async () => {
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

    const fetcher = await mirroredStripeFetcher(db);
    const total = (await listAllSubscriptions(db)).length;
    const result = await reconcileLocalSubscriptions(db, fetcher);

    expect(result).toEqual({
      checked: total,
      matched: total,
      divergences: 0,
    });
    const alerts = await drainOutbox(db, 10);
    expect(
      alerts.some(
        (entry) => entry.topic === BILLING_RECONCILIATION_ALERT_TOPIC,
      ),
    ).toBe(false);
  });

  it("alerts on divergence and does not repair local subscription state", async () => {
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
    await setSubscriptionStatus(db, subscriptionId, "canceled");

    const total = (await listAllSubscriptions(db)).length;
    const fetcher = await mirroredStripeFetcher(db, {
      [subscriptionId]: { status: "active" },
    });
    const result = await reconcileLocalSubscriptions(db, fetcher);

    expect(result).toEqual({
      checked: total,
      matched: total - 1,
      divergences: 1,
    });

    const localAfter = await findSubscriptionByStripeId(db, subscriptionId);
    expect(localAfter?.status).toBe("canceled");
    expect(await cardTierOf(db, memberId)).toBe("vip");

    const alerts = await drainOutbox(db, 10);
    const alert = alerts.find(
      (entry) =>
        entry.topic === BILLING_RECONCILIATION_ALERT_TOPIC &&
        (entry.payload as ReconciliationAlertPayload).stripeSubscriptionId ===
          subscriptionId,
    );
    expect(alert).toBeDefined();

    const payload = alert!.payload as ReconciliationAlertPayload;
    expect(payload.stripeSubscriptionId).toBe(subscriptionId);
    expect(payload.memberId).toBe(memberId);
    expect(payload.differences).toContainEqual({
      field: "status",
      local: "canceled",
      stripe: "active",
    });
  });

  it("alerts when Stripe no longer has a locally non-deleted subscription", async () => {
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

    const total = (await listAllSubscriptions(db)).length;
    const fetcher = await mirroredStripeFetcher(db);
    const result = await reconcileLocalSubscriptions(db, (id) =>
      id === subscriptionId
        ? Promise.reject(new ResourceMissingError())
        : fetcher(id),
    );

    expect(result).toEqual({
      checked: total,
      matched: total - 1,
      divergences: 1,
    });

    const localAfter = await findSubscriptionByStripeId(db, subscriptionId);
    expect(localAfter?.status).toBe("active");

    const alerts = await drainOutbox(db, 10);
    const alert = alerts.find(
      (entry) =>
        entry.topic === BILLING_RECONCILIATION_ALERT_TOPIC &&
        (entry.payload as ReconciliationAlertPayload).stripeSubscriptionId ===
          subscriptionId,
    );
    expect(alert).toBeDefined();

    const payload = alert!.payload as ReconciliationAlertPayload;
    expect(payload.differences).toContainEqual({
      field: "status",
      local: "active",
      stripe: "deleted",
    });
  });
});

/**
 * ADR 0017. Until it, the webhook only enqueued and `vercel.json` drained the
 * outbox once a day, so a paid upgrade appeared the following morning — FR-026
 * missed by roughly 1440x on a Must requirement.
 *
 * What a test can prove is the *architecture*: that the projection happens in
 * the webhook's own invocation, with no scheduled run involved. The 60-second
 * wall clock itself is a deployment property and is not asserted here — see
 * the backlog item `fr-026-60s-bound-not-tested`.
 */
describe("FR-026: the tier is projected without waiting for a scheduled drain", () => {
  it("FR-026: the webhook's deferred work moves the card tier, with no cron run", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    const eventId = `evt_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);

    const event = {
      id: eventId,
      type: "customer.subscription.created",
      created: EPOCH,
      data: { object: { id: subscriptionId } },
    } as unknown as Stripe.Event;

    const deferred: Array<() => Promise<void>> = [];
    const response = await handleStripeWebhook(
      new Request("https://kclub.test/api/webhooks/stripe", {
        method: "POST",
        headers: { "Stripe-Signature": "t=0,v1=verified-by-the-fixture" },
        body: "{}",
      }),
      (task) => {
        deferred.push(task);
      },
      {
        db: testDb(),
        constructEvent: () => event,
        drain: () =>
          runOutboxDrain(INLINE_BATCH_SIZE, {
            db: testDb(),
            fetchSubscription: (id) =>
              id === subscriptionId
                ? Promise.resolve(
                    subscriptionFixture(memberId, { id: subscriptionId }),
                  )
                : Promise.reject(new Error(`unexpected subscription ${id}`)),
          }),
      },
    );

    // The response Stripe waits for carries no projection work: the row is
    // enqueued, the tier has not moved, and the handler is already done.
    expect(response.status).toBe(200);
    expect(await cardTierOf(db, memberId)).toBe("free");
    expect(await countPending(db)).toBe(1);
    expect(deferred).toHaveLength(1);

    // What `after()` runs in production. No cron route is invoked anywhere in
    // this test, and vercel.json's schedule is irrelevant to it.
    await deferred[0]!();

    expect(await cardTierOf(db, memberId)).toBe("vip");
    expect(await countPending(db)).toBe(0);
  });

  it("FR-026: a failed projection leaves the row for the retry sweep, not the member", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedMemberAndCard(db, memberId);

    const event = {
      id: `evt_${crypto.randomUUID()}`,
      type: "customer.subscription.created",
      created: EPOCH,
      data: { object: { id: subscriptionId } },
    } as unknown as Stripe.Event;

    const deferred: Array<() => Promise<void>> = [];
    const response = await handleStripeWebhook(
      new Request("https://kclub.test/api/webhooks/stripe", {
        method: "POST",
        headers: { "Stripe-Signature": "t=0,v1=verified-by-the-fixture" },
        body: "{}",
      }),
      (task) => {
        deferred.push(task);
      },
      {
        db: testDb(),
        constructEvent: () => event,
        drain: () =>
          runOutboxDrain(INLINE_BATCH_SIZE, {
            db: testDb(),
            fetchSubscription: () =>
              Promise.reject(new Error("Stripe is down")),
          }),
      },
    );

    expect(response.status).toBe(200);
    await deferred[0]!();

    // The inline drain failed. The outbox row must survive it unprocessed, so
    // that the scheduled sweep still has something to retry.
    expect(await cardTierOf(db, memberId)).toBe("free");
    expect(await countPending(db)).toBe(1);
  });
});

/**
 * FR-056's second half: "notify the subscriber on failure **and before
 * expiry**". The failure notice comes from the invoice.payment_failed webhook;
 * these cases cover the warning that never existed until 2026-08-23.
 *
 * The deadline is derived, not stored: dunning begins at `currentPeriodStart`
 * once the status is `past_due`, because Stripe advances the period when the
 * renewal invoice is created rather than when it is paid. That behaviour is
 * pinned against a real test clock in tests/billing-lifecycle.stripe.test.ts.
 */
describe("FR-056: warning before the grace period expires", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const HOUR = 60 * 60 * 1000;
  const NOW = new Date("2026-08-23T12:00:00Z");

  /**
   * Seed a subscription through the real fold rather than by hand, so the row
   * under test is the row production would have written. `anchor` is when
   * dunning started; the period end sits a month later, as Stripe leaves it.
   */
  async function seedPastDue(
    db: DbClient,
    memberId: string,
    subscriptionId: string,
    anchor: Date,
    status: Stripe.Subscription.Status = "past_due",
  ): Promise<void> {
    await seedMemberAndCard(db, memberId);

    const startEpoch = Math.floor(anchor.getTime() / 1000);
    const endEpoch = startEpoch + 30 * 24 * 60 * 60;

    await reconcileSubscription(
      db,
      () =>
        Promise.resolve(
          subscriptionFixture(memberId, {
            id: subscriptionId,
            status,
            items: {
              data: [
                {
                  price: { id: "price_vip_monthly" },
                  current_period_start: startEpoch,
                  current_period_end: endEpoch,
                } as Stripe.SubscriptionItem,
              ],
            } as Stripe.ApiList<Stripe.SubscriptionItem>,
          }),
        ),
      subscriptionId,
      startEpoch,
    );
  }

  async function warningRowsFor(
    db: DbClient,
    subscriptionId: string,
  ): Promise<number> {
    const rows = await db.select().from(outbox);
    return rows.filter((row) => {
      const payload = row.payload as { type?: string; subscriptionId?: string };
      return (
        payload.type === GRACE_EXPIRY_WARNING_NOTIFICATION &&
        payload.subscriptionId === subscriptionId
      );
    }).length;
  }

  it("FR-056: a past_due subscription inside the lead window is warned", async () => {
    const db = testDbClient();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    // Dunning started 12 days ago, so the 14-day deadline is 2 days out.
    await seedPastDue(
      db,
      crypto.randomUUID(),
      subscriptionId,
      new Date(NOW.getTime() - 12 * DAY),
    );

    const result = await runGraceExpiryWarningSweep(db, NOW);

    expect(result).toMatchObject({ checked: 1, queued: 1, failed: 0 });
    expect(await warningRowsFor(db, subscriptionId)).toBe(1);
  });

  it("FR-056: a past_due subscription early in its grace period is not warned yet", async () => {
    const db = testDbClient();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedPastDue(
      db,
      crypto.randomUUID(),
      subscriptionId,
      new Date(NOW.getTime() - 2 * DAY),
    );

    const result = await runGraceExpiryWarningSweep(db, NOW);

    expect(result.checked).toBe(0);
    expect(await warningRowsFor(db, subscriptionId)).toBe(0);
  });

  it("FR-056: a past_due subscription whose grace has already expired is not warned", async () => {
    const db = testDbClient();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedPastDue(
      db,
      crypto.randomUUID(),
      subscriptionId,
      new Date(NOW.getTime() - 15 * DAY),
    );

    const result = await runGraceExpiryWarningSweep(db, NOW);

    expect(result.checked).toBe(0);
    expect(await warningRowsFor(db, subscriptionId)).toBe(0);
  });

  it("FR-056: an active subscription is never warned, whatever its dates", async () => {
    const db = testDbClient();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    await seedPastDue(
      db,
      crypto.randomUUID(),
      subscriptionId,
      new Date(NOW.getTime() - 12 * DAY),
      "active",
    );

    const result = await runGraceExpiryWarningSweep(db, NOW);

    expect(result.checked).toBe(0);
    expect(await warningRowsFor(db, subscriptionId)).toBe(0);
  });

  it("FR-056: the warning is enqueued exactly once across three daily sweeps", async () => {
    const db = testDbClient();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    // Chosen so all three sweeps fall inside the lead window — what suppresses
    // the second and third is the outbox row, not the arithmetic.
    await seedPastDue(
      db,
      crypto.randomUUID(),
      subscriptionId,
      new Date(NOW.getTime() - (11 * DAY + HOUR)),
    );

    const first = await runGraceExpiryWarningSweep(db, NOW);
    const second = await runGraceExpiryWarningSweep(
      db,
      new Date(NOW.getTime() + DAY),
    );
    const third = await runGraceExpiryWarningSweep(
      db,
      new Date(NOW.getTime() + 2 * DAY),
    );

    expect(first).toMatchObject({ checked: 1, queued: 1 });
    expect(second).toMatchObject({ checked: 0, queued: 0 });
    expect(third).toMatchObject({ checked: 0, queued: 0 });
    expect(await warningRowsFor(db, subscriptionId)).toBe(1);

    // Nothing drained the row between sweeps, so an undrained warning
    // suppresses a duplicate just as a sent one does.
    expect(await countPending(db)).toBe(1);
  });

  it("FR-056: a warning from a previous billing period does not suppress the next one", async () => {
    const db = testDbClient();
    const subscriptionId = `sub_${crypto.randomUUID()}`;
    const anchor = new Date(NOW.getTime() - 12 * DAY);
    await seedPastDue(db, crypto.randomUUID(), subscriptionId, anchor);

    // A warning for the *previous* cycle, enqueued before this period began.
    await db.insert(outbox).values({
      topic: "billing.notification",
      payload: {
        type: GRACE_EXPIRY_WARNING_NOTIFICATION,
        subscriptionId,
        customerId: "cus_test",
      },
      createdAt: new Date(anchor.getTime() - DAY),
      processedAt: new Date(anchor.getTime() - DAY),
    });

    const result = await runGraceExpiryWarningSweep(db, NOW);

    expect(result).toMatchObject({ checked: 1, queued: 1 });
    expect(await warningRowsFor(db, subscriptionId)).toBe(2);
  });
});
