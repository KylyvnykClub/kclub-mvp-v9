import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import type { Db, DbClient } from "@/data/db.js";
import { getTestDb } from "./setup/integration-setup.js";
import { foldSubscription } from "@/modules/billing/projection.js";
import {
  findSubscriptionByStripeId,
  graceAnchorOf,
  processWebhookOnce,
} from "@/data/billing.js";
import {
  listApprovedCompaniesByIds,
  listCompanyIdsWithActiveSubscription,
} from "@/data/companies.js";
import {
  businessCategories,
  cards,
  companies,
  members,
} from "@/data/schema/index.js";

/**
 * AC-03: the billing lifecycle rehearsed against real Stripe test mode with a
 * test clock.
 *
 * billing-projection.integration.test.ts already proves the fold against
 * hand-built Stripe objects. What it cannot prove is that those objects match
 * what Stripe actually sends: a renamed field or a moved timestamp would leave
 * every fixture-based test green while production silently mis-projects. This
 * suite drives a real subscription through subscribe, renew, fail, dun,
 * recover, cancel and lapse, folding the subscription Stripe hands back at
 * each step.
 *
 * It never runs against a live key, and it deletes its test clock afterwards -
 * which takes the customer and subscriptions with it.
 */

const secretKey = process.env["STRIPE_SECRET_KEY"];
const usable = typeof secretKey === "string" && secretKey.startsWith("sk_test");

if (!usable) {
  console.warn(
    "[AC-03] skipping the Stripe lifecycle rehearsal: STRIPE_SECRET_KEY is absent or is not a test-mode key.",
  );
}

const describeWithStripe = usable ? describe : describe.skip;

/**
 * Stripe's constructor needs *a* non-empty string even when every test below
 * is skipped. The fallback is deliberately not key-shaped: a placeholder that
 * looks like a real key forces the secret scanner to tell fakes from the real
 * thing, and a scanner that has to make that judgement is one that will
 * eventually get it wrong in the permissive direction.
 */
const stripe = new Stripe(secretKey ?? "no-key-suite-is-skipped");

const createdClockIds: string[] = [];

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

function testDb(): Db {
  return getTestDb() as unknown as Db;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Advancing a clock is asynchronous on Stripe's side: the call returns while
 * the clock is still `advancing`, and the invoices it triggers do not exist
 * until it reports `ready`.
 */
async function advanceClock(clockId: string, to: number): Promise<void> {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: to });

  for (let attempt = 0; attempt < 90; attempt += 1) {
    const clock = await stripe.testHelpers.testClocks.retrieve(clockId);
    if (clock.status === "ready") return;
    if (clock.status === "internal_failure") {
      throw new Error(`Stripe test clock ${clockId} failed to advance`);
    }
    await sleep(2000);
  }

  throw new Error(`Stripe test clock ${clockId} did not settle`);
}

async function createClock(): Promise<Stripe.TestHelpers.TestClock> {
  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: Math.floor(Date.now() / 1000),
  });
  createdClockIds.push(clock.id);
  return clock;
}

async function createCustomerWithCard(
  clockId: string,
  paymentMethod = "pm_card_visa",
): Promise<Stripe.Customer> {
  const customer = await stripe.customers.create({ test_clock: clockId });
  await setPaymentMethod(customer.id, paymentMethod);
  return customer;
}

async function setPaymentMethod(
  customerId: string,
  paymentMethod: string,
): Promise<void> {
  const attached = await stripe.paymentMethods.attach(paymentMethod, {
    customer: customerId,
  });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: attached.id },
  });
}

async function createMonthlyPrice(nickname: string): Promise<Stripe.Price> {
  return stripe.prices.create({
    currency: "usd",
    unit_amount: 2900,
    recurring: { interval: "month" },
    product_data: { name: `KCLUB ${nickname} (AC-03 rehearsal)` },
  });
}

async function seedMember(db: DbClient): Promise<string> {
  const memberId = crypto.randomUUID();
  await db.insert(members).values({
    id: memberId,
    phone: `+1${Math.floor(1_000_000_000 + Math.random() * 9_000_000_000)}`,
    passwordHash: "hash",
    displayName: "Lifecycle Member",
    country: "US",
    language: "en",
  });
  await db.insert(cards).values({
    memberId,
    serial: `KCLUB-${Math.floor(100_000 + Math.random() * 900_000)}`,
    token: `tok-${crypto.randomUUID()}`,
    tier: "free",
  });
  return memberId;
}

async function seedApprovedCompany(
  db: DbClient,
  ownerId: string,
): Promise<string> {
  const categoryId = Math.floor(700_000 + Math.random() * 90_000);
  await db
    .insert(businessCategories)
    .values({
      id: categoryId,
      block: "Services",
      category: "Consulting",
      subcategory: `Lifecycle ${categoryId}`,
      status: "ACTIVE",
    })
    .onConflictDoNothing();

  const [company] = await db
    .insert(companies)
    .values({
      ownerId,
      businessCategoryId: categoryId,
      name: `Lifecycle Partner ${categoryId}`,
      slug: `lifecycle-partner-${categoryId}`,
      country: "US",
      city: "New York",
      moderationStatus: "approved",
    })
    .returning();

  return company!.id;
}

async function cardTierOf(db: DbClient, memberId: string) {
  const rows = await db
    .select()
    .from(cards)
    .where(eq(cards.memberId, memberId));
  return rows[0]?.tier;
}

/** Fold whatever Stripe currently holds for this subscription. */
async function foldCurrent(
  db: DbClient,
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await foldSubscription(db, subscription, new Date());
  return subscription;
}

function periodEndOf(subscription: Stripe.Subscription): number {
  const item = subscription.items.data[0];
  if (!item) throw new Error("subscription has no items");
  return item.current_period_end;
}

afterAll(async () => {
  for (const clockId of createdClockIds) {
    // Deleting the clock removes the customer and its subscriptions with it.
    await stripe.testHelpers.testClocks.del(clockId).catch(() => undefined);
  }
});

describeWithStripe(
  "AC-03: billing lifecycle against Stripe test clocks",
  () => {
    it("FR-052, FR-054, FR-056: subscribe, renew, fail, dun, recover, cancel and lapse keep access in step with money", async () => {
      const db = testDbClient();
      const memberId = await seedMember(db);

      const clock = await createClock();
      const customer = await createCustomerWithCard(clock.id);
      const price = await createMonthlyPrice("VIP");

      // 1. Subscribe. The metadata is what the checkout flow writes and what the
      //    projection reads to find the member.
      const created = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: price.id }],
        metadata: { memberId },
      });
      await foldSubscription(db, created, new Date());

      expect(created.status).toBe("active");
      await expect(cardTierOf(db, memberId)).resolves.toBe("vip");

      const firstPeriodEnd = periodEndOf(created);

      // 2. Renew. Advancing past the period end makes Stripe invoice and charge.
      await advanceClock(clock.id, firstPeriodEnd + 3600);
      const renewed = await foldCurrent(db, created.id);

      expect(renewed.status).toBe("active");
      expect(periodEndOf(renewed)).toBeGreaterThan(firstPeriodEnd);
      await expect(cardTierOf(db, memberId)).resolves.toBe("vip");

      const renewedRow = await findSubscriptionByStripeId(db, created.id);
      expect(renewedRow?.currentPeriodEnd.getTime()).toBe(
        periodEndOf(renewed) * 1000,
      );

      // 3. Fail. A card that always declines turns the next renewal into a
      //    dunning cycle rather than a payment.
      await setPaymentMethod(customer.id, "pm_card_chargeCustomerFail");
      await advanceClock(clock.id, periodEndOf(renewed) + 3600);
      const failed = await foldCurrent(db, created.id);

      expect(failed.status).toBe("past_due");

      // 4. Dun. FR-056: Stripe is still retrying, so access is retained.
      await expect(cardTierOf(db, memberId)).resolves.toBe("vip");

      // FR-056: which end of the row is the dunning clock? The grace-expiry
      // warning derives its deadline from this and nothing else, so pin it
      // here rather than in a comment. Stripe advances the period when the
      // renewal invoice is *created*, not when it is paid — so for a past_due
      // row the period has already moved on: `currentPeriodStart` is when
      // dunning began and `currentPeriodEnd` is a month away. See
      // graceAnchorOf() in src/data/billing.ts.
      const duningRow = await findSubscriptionByStripeId(db, created.id);
      expect(duningRow?.currentPeriodStart.getTime()).toBeGreaterThanOrEqual(
        periodEndOf(renewed) * 1000,
      );
      expect(duningRow?.currentPeriodEnd.getTime()).toBeGreaterThan(
        periodEndOf(renewed) * 1000,
      );
      expect(
        graceAnchorOf(duningRow!, new Date(periodEndOf(renewed) * 1000)),
      ).toEqual(duningRow!.currentPeriodStart);

      // 5. Recover. A working card plus paying the open invoice returns the
      //    subscription to active without any change on our side.
      await setPaymentMethod(customer.id, "pm_card_visa");
      const openInvoices = await stripe.invoices.list({
        customer: customer.id,
        status: "open",
        limit: 1,
      });
      const openInvoice = openInvoices.data[0];
      expect(
        openInvoice,
        "the failed renewal should leave an open invoice",
      ).toBeTruthy();
      await stripe.invoices.pay(openInvoice!.id);

      const recovered = await foldCurrent(db, created.id);
      expect(recovered.status).toBe("active");
      await expect(cardTierOf(db, memberId)).resolves.toBe("vip");

      // 6. Cancel at period end. FR-054: paid-for time is not taken away.
      const cancelling = await stripe.subscriptions.update(created.id, {
        cancel_at_period_end: true,
      });
      await foldSubscription(db, cancelling, new Date());

      expect(cancelling.cancel_at_period_end).toBe(true);
      expect(cancelling.status).toBe("active");
      await expect(cardTierOf(db, memberId)).resolves.toBe("vip");

      // 7. Lapse. Once the paid period ends, Stripe cancels and access goes.
      await advanceClock(clock.id, periodEndOf(cancelling) + 3600);
      const lapsed = await foldCurrent(db, created.id);

      expect(lapsed.status).toBe("canceled");
      await expect(cardTierOf(db, memberId)).resolves.toBe("free");

      const lapsedRow = await findSubscriptionByStripeId(db, created.id);
      expect(lapsedRow?.status).toBe("canceled");
    });

    it("FR-053: a real Stripe event folded twice, and an older one after a newer, leave the projection unchanged", async () => {
      const db = testDbClient();
      const memberId = await seedMember(db);

      const clock = await createClock();
      const customer = await createCustomerWithCard(clock.id);
      const price = await createMonthlyPrice("idempotency");

      const created = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: price.id }],
        metadata: { memberId },
      });
      await foldSubscription(db, created, new Date());

      await advanceClock(clock.id, periodEndOf(created) + 3600);
      const renewed = await stripe.subscriptions.retrieve(created.id);

      // The events Stripe actually emitted for this subscription, newest first.
      const events = await stripe.events.list({
        type: "customer.subscription.updated",
        limit: 100,
      });
      const mine = events.data.filter(
        (event) => (event.data.object as Stripe.Subscription).id === created.id,
      );
      expect(
        mine.length,
        "the renewal should have produced at least one subscription event",
      ).toBeGreaterThan(0);

      const newest = mine[0]!;

      // Newest first: this is the state the projection should keep.
      await foldSubscription(db, renewed, new Date(newest.created * 1000));
      const afterNewest = await findSubscriptionByStripeId(db, created.id);

      // The same event delivered twice - the webhook route's idempotency key is
      // the event id, enforced by a primary key rather than by remembering.
      const firstDelivery = await processWebhookOnce(
        testDb(),
        newest.id,
        newest.type,
        async () => {
          await foldSubscription(db, renewed, new Date(newest.created * 1000));
        },
      );
      const secondDelivery = await processWebhookOnce(
        testDb(),
        newest.id,
        newest.type,
        () => {
          throw new Error("a duplicate event must not reach the handler");
        },
      );

      expect(firstDelivery).toBe(true);
      expect(secondDelivery).toBe(false);

      // An older event arriving late must not roll the projection backwards.
      const stale = await foldSubscription(
        db,
        created,
        new Date((newest.created - 3600) * 1000),
      );
      const afterStale = await findSubscriptionByStripeId(db, created.id);

      expect(stale).toBe("stale");
      expect(afterStale?.currentPeriodEnd.getTime()).toBe(
        afterNewest?.currentPeriodEnd.getTime(),
      );
    });

    it("FR-055: a lapsed listing subscription takes the company out of the catalogue", async () => {
      const db = testDbClient();
      const ownerId = await seedMember(db);
      const companyId = await seedApprovedCompany(db, ownerId);

      const clock = await createClock();
      const customer = await createCustomerWithCard(clock.id);
      const price = await createMonthlyPrice("listing");

      const created = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: price.id }],
        metadata: { memberId: ownerId, companyId },
      });
      await foldSubscription(db, created, new Date());

      const publishedIds = await listCompanyIdsWithActiveSubscription(db);
      expect(publishedIds).toContain(companyId);
      const published = await listApprovedCompaniesByIds(db, [companyId]);
      expect(published).toHaveLength(1);

      // A listing subscription must not touch the owner's card tier (FR-051).
      await expect(cardTierOf(db, ownerId)).resolves.toBe("free");

      await stripe.subscriptions.cancel(created.id);
      const cancelled = await foldCurrent(db, created.id);
      expect(cancelled.status).toBe("canceled");

      await expect(
        listCompanyIdsWithActiveSubscription(db),
      ).resolves.not.toContain(companyId);
    });
  },
);
