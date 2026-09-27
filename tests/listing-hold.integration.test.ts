import type Stripe from "stripe";
import { describe, expect, it } from "vitest";

import type { Db, DbClient } from "@/data/db.js";
import {
  companyListingIsPaid,
  insertCompany,
  listCompanyIdsWithPaidListing,
  setCompanyModerationStatus,
} from "@/data/companies.js";
import {
  listListingHoldsByCompany,
  memberIsPaidByHold,
} from "@/data/listing-holds.js";
import { members, outbox } from "@/data/schema/index.js";
import { BILLING_REFUND_RETRY_TOPIC, enqueueOutbox } from "@/data/outbox.js";
import {
  LISTING_HOLD_KIND,
  LISTING_HOLD_SETTLE_TOPIC,
  LISTING_HOLD_SYNC_TOPIC,
  listingHoldIdempotencyKey,
  openListingHoldCheckout,
  projectListingHold,
  refundCapturedListingHolds,
  settleListingHolds,
  type ListingHoldDeps,
} from "@/modules/billing/listing-hold.js";
import { handleStripeWebhook } from "@/modules/billing/stripe-webhook.js";
import {
  INLINE_BATCH_SIZE,
  runOutboxDrain,
} from "@/modules/platform/outbox-worker.js";
import { eq } from "drizzle-orm";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * ADR 0037, FR-113…FR-116: a partner's card is held at application, captured
 * on approval and released on rejection - and the listing is published only
 * once Stripe's own `payment_intent.succeeded` has been projected.
 *
 * Stripe is a fake that keeps PaymentIntents in memory and moves them between
 * states the way Stripe does: `capture` turns `requires_capture` into
 * `succeeded`, `cancel` into `canceled`, and either refuses a PaymentIntent in
 * any other state with `payment_intent_unexpected_state`. Every call is
 * recorded with its idempotency key, so the tests can say what was asked of
 * Stripe and how many times.
 */

function db(): DbClient {
  return getTestDb() as unknown as DbClient;
}

const NOW = new Date("2026-09-26T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

type Call = { op: string; id: string; key?: string };

function fakeStripe() {
  const intents = new Map<string, Stripe.PaymentIntent>();
  const calls: Call[] = [];
  let sequence = 0;

  const unexpected = () =>
    Object.assign(new Error("unexpected state"), {
      code: "payment_intent_unexpected_state",
    });

  function authorise(input: {
    companyId: string;
    memberId: string;
    captureBefore?: Date;
  }): string {
    sequence += 1;
    const id = `pi_test_${sequence}`;
    intents.set(id, {
      id,
      object: "payment_intent",
      status: "requires_capture",
      amount: 1999,
      currency: "usd",
      customer: "cus_test",
      payment_method: "pm_test",
      metadata: {
        kind: LISTING_HOLD_KIND,
        companyId: input.companyId,
        memberId: input.memberId,
      },
      latest_charge: {
        id: `ch_${id}`,
        object: "charge",
        refunded: false,
        payment_method_details: {
          card: {
            capture_before: Math.floor(
              (
                input.captureBefore ?? new Date(NOW.getTime() + 6 * DAY)
              ).getTime() / 1000,
            ),
          },
        },
      },
    } as unknown as Stripe.PaymentIntent);
    return id;
  }

  const deps: ListingHoldDeps = {
    createCheckoutSession: (params, key) => {
      calls.push({ op: "checkout", id: "", key });
      expect(params.payment_intent_data?.capture_method).toBe("manual");
      return Promise.resolve({ url: "https://checkout.stripe.test/session" });
    },
    retrievePrice: () =>
      Promise.resolve({
        id: "price_listing",
        unit_amount: 1999,
        currency: "usd",
        product: "prod_listing",
      } as Stripe.Price),
    retrievePaymentIntent: (id) => {
      const intent = intents.get(id);
      return intent
        ? Promise.resolve(structuredClone(intent))
        : Promise.reject(new Error(`no such intent ${id}`));
    },
    capturePaymentIntent: (id, key) => {
      calls.push({ op: "capture", id, key });
      const intent = intents.get(id)!;
      if (intent.status !== "requires_capture") {
        return Promise.reject(unexpected());
      }
      intent.status = "succeeded";
      return Promise.resolve(intent);
    },
    cancelPaymentIntent: (id, key) => {
      calls.push({ op: "cancel", id, key });
      const intent = intents.get(id)!;
      if (intent.status === "canceled" || intent.status === "succeeded") {
        return Promise.reject(unexpected());
      }
      intent.status = "canceled";
      return Promise.resolve(intent);
    },
    refundPaymentIntent: (id, key) => {
      calls.push({ op: "refund", id, key });
      return Promise.resolve({});
    },
    createSubscription: (params, key) => {
      calls.push({ op: "subscription", id: String(params.customer), key });
      expect(params.collection_method).toBe("charge_automatically");
      expect(params.default_payment_method).toBe("pm_test");
      return Promise.resolve({ id: "sub_listing_test" });
    },
    listingPriceId: () => Promise.resolve("price_listing"),
  };

  return {
    deps,
    calls,
    intents,
    authorise,
    ops: (op: string) => calls.filter((c) => c.op === op),
    lapse: (id: string) => {
      intents.get(id)!.status = "canceled";
    },
  };
}

async function seedPartner(
  moderationStatus: "pending" = "pending",
  duesKind: "partner" | "paying" = "partner",
) {
  const [member] = await db()
    .insert(members)
    .values({
      phone: `+15557${crypto.randomUUID().slice(0, 8)}`,
      passwordHash: "hash",
      displayName: "Held Partner",
      country: "UA",
      language: "en",
      role: "member",
      status: "active",
      duesKind,
    })
    .returning();

  const companyId = await insertCompany(db(), {
    ownerId: member!.id,
    name: "Held Co",
    slug: `held-co-${crypto.randomUUID().slice(0, 8)}`,
    moderationStatus,
  });

  return { memberId: member!.id, companyId };
}

/** Stripe's event clock: each delivery a second after the last. */
let eventClock = Math.floor(NOW.getTime() / 1000);
const nextEvent = () => (eventClock += 1);

describe("FR-113: the application holds the price, nothing more", () => {
  it("FR-113: opens a manually captured checkout for a pending application", async () => {
    const stripe = fakeStripe();
    const { memberId, companyId } = await seedPartner();

    const result = await openListingHoldCheckout(db(), stripe.deps, {
      memberId,
      companyId,
      stripeCustomerId: "cus_test",
      receiptEmail: "partner@example.test",
      priceId: "price_listing",
      successUrl: "https://kclub.test/ok",
      cancelUrl: "https://kclub.test/cancel",
      now: NOW,
    });

    expect(result.outcome).toBe("opened");
    expect(stripe.ops("checkout")).toHaveLength(1);
  });

  it("FR-113: records the hold from Stripe and does not publish it", async () => {
    const stripe = fakeStripe();
    const { memberId, companyId } = await seedPartner();
    const pi = stripe.authorise({ companyId, memberId });

    expect(
      await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW),
    ).toBe("applied");

    const [hold] = await listListingHoldsByCompany(db(), companyId);
    expect(hold?.status).toBe("requires_capture");
    expect(hold?.amountMinor).toBe(1999);
    expect(hold?.captureBefore).not.toBeNull();
    expect(stripe.ops("capture")).toHaveLength(0);
    expect(await companyListingIsPaid(db(), companyId, NOW)).toBe(false);
  });

  it("FR-113: refuses to open a second checkout while one is held", async () => {
    const stripe = fakeStripe();
    const { memberId, companyId } = await seedPartner();
    const pi = stripe.authorise({ companyId, memberId });
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);

    const result = await openListingHoldCheckout(db(), stripe.deps, {
      memberId,
      companyId,
      stripeCustomerId: "cus_test",
      receiptEmail: null,
      priceId: "price_listing",
      successUrl: "https://kclub.test/ok",
      cancelUrl: "https://kclub.test/cancel",
      now: NOW,
    });

    expect(result).toEqual({ outcome: "not_needed", standing: "held" });
  });

  it("FR-113: will not open a checkout for somebody else's company", async () => {
    const stripe = fakeStripe();
    const { companyId } = await seedPartner();
    const stranger = await seedPartner();

    await expect(
      openListingHoldCheckout(db(), stripe.deps, {
        memberId: stranger.memberId,
        companyId,
        stripeCustomerId: "cus_test",
        receiptEmail: null,
        priceId: "price_listing",
        successUrl: "https://kclub.test/ok",
        cancelUrl: "https://kclub.test/cancel",
        now: NOW,
      }),
    ).rejects.toThrow();
  });
});

describe("FR-114: approve captures, and only the webhook publishes", () => {
  it("FR-114: approve → capture → payment_intent.succeeded → published → subscription", async () => {
    const stripe = fakeStripe();
    const { memberId, companyId } = await seedPartner();
    const pi = stripe.authorise({ companyId, memberId });
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);

    // APPROVE
    await setCompanyModerationStatus(db(), companyId, "approved", null);
    const report = await settleListingHolds(db(), stripe.deps, companyId, NOW);

    expect(report.captureRequested).toBe(true);
    expect(stripe.ops("capture")).toEqual([
      {
        op: "capture",
        id: pi,
        key: listingHoldIdempotencyKey("capture", pi),
      },
    ]);

    // Stripe has captured, but its event has not arrived: nothing is live.
    expect(await companyListingIsPaid(db(), companyId, NOW)).toBe(false);
    expect(await listCompanyIdsWithPaidListing(db(), NOW)).not.toContain(
      companyId,
    );
    expect(await memberIsPaidByHold(db(), memberId, NOW)).toBe(false);

    // payment_intent.succeeded
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);

    expect(await companyListingIsPaid(db(), companyId, NOW)).toBe(true);
    expect(await listCompanyIdsWithPaidListing(db(), NOW)).toContain(companyId);
    expect(await memberIsPaidByHold(db(), memberId, NOW)).toBe(true);

    const [hold] = await listListingHoldsByCompany(db(), companyId);
    expect(hold?.status).toBe("succeeded");
    expect(hold?.stripeSubscriptionId).toBe("sub_listing_test");
    expect(stripe.ops("subscription")).toHaveLength(1);
    expect(stripe.ops("subscription")[0]?.key).toBe(
      listingHoldIdempotencyKey("subscription", pi),
    );
  });

  it("FR-114: a pending application is never captured, however often it is settled", async () => {
    const stripe = fakeStripe();
    const { memberId, companyId } = await seedPartner();
    const pi = stripe.authorise({ companyId, memberId });
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);

    await settleListingHolds(db(), stripe.deps, companyId, NOW);
    await settleListingHolds(db(), stripe.deps, companyId, NOW);

    expect(stripe.ops("capture")).toHaveLength(0);
    expect(stripe.intents.get(pi)?.status).toBe("requires_capture");
  });

  it("FR-114: an authorisation that lapsed is not captured and publishes nothing", async () => {
    const stripe = fakeStripe();
    const { memberId, companyId } = await seedPartner();
    const pi = stripe.authorise({ companyId, memberId });
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);

    // The card network released it; payment_intent.canceled arrives.
    stripe.lapse(pi);
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);

    await setCompanyModerationStatus(db(), companyId, "approved", null);
    const report = await settleListingHolds(db(), stripe.deps, companyId, NOW);

    expect(report.captureRequested).toBe(false);
    expect(stripe.ops("capture")).toHaveLength(0);
    expect(await companyListingIsPaid(db(), companyId, NOW)).toBe(false);
  });

  it("FR-114: an authorisation past its deadline is not captured even before Stripe says so", async () => {
    const stripe = fakeStripe();
    const { memberId, companyId } = await seedPartner();
    const pi = stripe.authorise({
      companyId,
      memberId,
      captureBefore: new Date(NOW.getTime() - 60_000),
    });
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);

    await setCompanyModerationStatus(db(), companyId, "approved", null);
    await settleListingHolds(db(), stripe.deps, companyId, NOW);

    expect(stripe.ops("capture")).toHaveLength(0);
  });

  it("FR-114: a capture Stripe refuses leaves the listing unpublished", async () => {
    const stripe = fakeStripe();
    const { memberId, companyId } = await seedPartner();
    const pi = stripe.authorise({ companyId, memberId });
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);

    // Lapsed at Stripe after our last projection; the capture is refused.
    stripe.lapse(pi);
    await setCompanyModerationStatus(db(), companyId, "approved", null);
    const report = await settleListingHolds(db(), stripe.deps, companyId, NOW);

    expect(report.captureRequested).toBe(false);
    expect(await companyListingIsPaid(db(), companyId, NOW)).toBe(false);
  });

  it("FR-114: a repeated settlement after capture asks Stripe for nothing new", async () => {
    const stripe = fakeStripe();
    const { memberId, companyId } = await seedPartner();
    const pi = stripe.authorise({ companyId, memberId });
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);
    await setCompanyModerationStatus(db(), companyId, "approved", null);
    await settleListingHolds(db(), stripe.deps, companyId, NOW);
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);

    const before = stripe.calls.length;
    await settleListingHolds(db(), stripe.deps, companyId, NOW);
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);

    expect(stripe.calls.slice(before).map((c) => c.op)).toEqual([]);
  });

  it("FR-114: the paid month ends when it ends", async () => {
    const stripe = fakeStripe();
    const { memberId, companyId } = await seedPartner();
    const pi = stripe.authorise({ companyId, memberId });
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);
    await setCompanyModerationStatus(db(), companyId, "approved", null);
    await settleListingHolds(db(), stripe.deps, companyId, NOW);
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);

    const later = new Date(NOW.getTime() + 40 * DAY);
    expect(await companyListingIsPaid(db(), companyId, later)).toBe(false);
  });
});

describe("FR-115: reject releases the hold", () => {
  it("FR-115: cancels the authorisation and never captures", async () => {
    const stripe = fakeStripe();
    const { memberId, companyId } = await seedPartner();
    const pi = stripe.authorise({ companyId, memberId });
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);

    await setCompanyModerationStatus(db(), companyId, "rejected", "No");
    await settleListingHolds(db(), stripe.deps, companyId, NOW);
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);

    expect(stripe.ops("cancel")).toEqual([
      { op: "cancel", id: pi, key: listingHoldIdempotencyKey("cancel", pi) },
    ]);
    expect(stripe.ops("capture")).toHaveLength(0);
    const [hold] = await listListingHoldsByCompany(db(), companyId);
    expect(hold?.status).toBe("canceled");
    expect(await companyListingIsPaid(db(), companyId, NOW)).toBe(false);
  });

  it("FR-115: a hold authorised after the rejection is released as soon as Stripe reports it", async () => {
    const stripe = fakeStripe();
    const { memberId, companyId } = await seedPartner();
    await setCompanyModerationStatus(db(), companyId, "rejected", "No");

    // A checkout left open in another tab, completed afterwards.
    const pi = stripe.authorise({ companyId, memberId });
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);

    expect(stripe.intents.get(pi)?.status).toBe("canceled");
  });

  it("FR-115: a listing rejected after it went live has its first month refunded", async () => {
    const stripe = fakeStripe();
    const { memberId, companyId } = await seedPartner();
    const pi = stripe.authorise({ companyId, memberId });
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);
    await setCompanyModerationStatus(db(), companyId, "approved", null);
    await settleListingHolds(db(), stripe.deps, companyId, NOW);
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);

    await setCompanyModerationStatus(db(), companyId, "rejected", "Later");
    const refunded = await refundCapturedListingHolds(
      db(),
      stripe.deps,
      companyId,
      NOW,
    );
    const again = await refundCapturedListingHolds(
      db(),
      stripe.deps,
      companyId,
      NOW,
    );

    expect(refunded).toEqual([{ paymentIntentId: pi, amountMinor: 1999 }]);
    expect(again).toEqual([]);
    expect(stripe.ops("refund")).toHaveLength(1);
    expect(await companyListingIsPaid(db(), companyId, NOW)).toBe(false);
  });
});

describe("FR-053: the webhook routes a hold's events exactly once", () => {
  function paymentIntentEvent(
    id: string,
    type: string,
    object: Partial<Stripe.PaymentIntent>,
  ): Stripe.Event {
    return {
      id,
      type,
      created: nextEvent(),
      data: { object: { object: "payment_intent", ...object } },
    } as unknown as Stripe.Event;
  }

  async function deliver(event: Stripe.Event, stripe: ListingHoldDeps) {
    const deferred: (() => Promise<void>)[] = [];
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
        db: getTestDb() as unknown as Db,
        constructEvent: () => event,
        drain: () =>
          runOutboxDrain(INLINE_BATCH_SIZE, {
            db: getTestDb() as unknown as Db,
            fetchSubscription: () =>
              Promise.reject(new Error("no subscription expected")),
            listingHold: stripe,
          }),
      },
    );
    for (const task of deferred) await task();
    return response;
  }

  it("FR-053: a duplicate delivery is recorded once and projects once", async () => {
    const stripe = fakeStripe();
    const { memberId, companyId } = await seedPartner();
    const pi = stripe.authorise({ companyId, memberId });
    const event = paymentIntentEvent(
      `evt_${crypto.randomUUID()}`,
      "payment_intent.amount_capturable_updated",
      { id: pi, metadata: { kind: LISTING_HOLD_KIND } },
    );

    expect((await deliver(event, stripe.deps)).status).toBe(200);
    expect((await deliver(event, stripe.deps)).status).toBe(200);

    const rows = await db()
      .select()
      .from(outbox)
      .where(eq(outbox.topic, LISTING_HOLD_SYNC_TOPIC));
    expect(
      rows.filter(
        (r) =>
          (r.payload as { paymentIntentId?: string }).paymentIntentId === pi,
      ),
    ).toHaveLength(1);

    const holds = await listListingHoldsByCompany(db(), companyId);
    expect(holds).toHaveLength(1);
  });

  it("FR-053: a forged payload cannot mark a hold paid - the state is re-read from Stripe", async () => {
    const stripe = fakeStripe();
    const { memberId, companyId } = await seedPartner();
    await setCompanyModerationStatus(db(), companyId, "approved", null);
    const pi = stripe.authorise({ companyId, memberId });
    stripe.intents.get(pi)!.status = "requires_payment_method";

    await deliver(
      paymentIntentEvent(
        `evt_${crypto.randomUUID()}`,
        "payment_intent.succeeded",
        {
          id: pi,
          status: "succeeded",
          metadata: { kind: LISTING_HOLD_KIND },
        },
      ),
      stripe.deps,
    );

    expect(await companyListingIsPaid(db(), companyId, NOW)).toBe(false);
  });

  it("FR-053: ignores PaymentIntents that are not listing holds", async () => {
    const stripe = fakeStripe();
    const event = paymentIntentEvent(
      `evt_${crypto.randomUUID()}`,
      "payment_intent.succeeded",
      { id: "pi_someone_else", metadata: {} },
    );

    expect((await deliver(event, stripe.deps)).status).toBe(200);
    const rows = await db()
      .select()
      .from(outbox)
      .where(eq(outbox.topic, LISTING_HOLD_SYNC_TOPIC));
    expect(
      rows.some(
        (r) =>
          (r.payload as { paymentIntentId?: string }).paymentIntentId ===
          "pi_someone_else",
      ),
    ).toBe(false);
  });
});

describe("review fixes: money and access still agree at the edges", () => {
  async function approvedAndCaptureRequested() {
    const stripe = fakeStripe();
    const { memberId, companyId } = await seedPartner();
    const pi = stripe.authorise({ companyId, memberId });
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);
    await setCompanyModerationStatus(db(), companyId, "approved", null);
    await settleListingHolds(db(), stripe.deps, companyId, NOW);
    return { stripe, memberId, companyId, pi };
  }

  it("FR-115: a rejection between the capture and its webhook refunds the capture once", async () => {
    const { stripe, memberId, companyId, pi } =
      await approvedAndCaptureRequested();

    // Rejected before payment_intent.succeeded arrives; the cancel is refused.
    await setCompanyModerationStatus(
      db(),
      companyId,
      "rejected",
      "Changed mind",
    );
    await settleListingHolds(db(), stripe.deps, companyId, NOW);

    // payment_intent.succeeded, delivered twice.
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);

    expect(stripe.ops("refund")).toHaveLength(1);
    expect(stripe.ops("subscription")).toHaveLength(0);
    expect(await companyListingIsPaid(db(), companyId, NOW)).toBe(false);
    expect(await memberIsPaidByHold(db(), memberId, NOW)).toBe(false);
  });

  it("FR-052: a refund made in the Stripe dashboard takes the listing down", async () => {
    const { stripe, companyId, pi } = await approvedAndCaptureRequested();
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);
    expect(await companyListingIsPaid(db(), companyId, NOW)).toBe(true);

    // charge.refunded: the PaymentIntent stays `succeeded`.
    (
      stripe.intents.get(pi)!.latest_charge as unknown as { refunded: boolean }
    ).refunded = true;
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);

    expect(await companyListingIsPaid(db(), companyId, NOW)).toBe(false);
  });

  it("FR-116: the paid month starts at the capture, not at a late-drained authorisation event", async () => {
    const stripe = fakeStripe();
    const { memberId, companyId } = await seedPartner();
    const pi = stripe.authorise({ companyId, memberId });
    const authorisedAt = nextEvent();
    await projectListingHold(db(), stripe.deps, pi, authorisedAt, NOW);

    const approvedAt = new Date(NOW.getTime() + 3 * DAY);
    await setCompanyModerationStatus(db(), companyId, "approved", null);
    await settleListingHolds(db(), stripe.deps, companyId, approvedAt);

    // The authorisation's own row drains only now, after Stripe captured.
    await projectListingHold(db(), stripe.deps, pi, authorisedAt, approvedAt);

    const [hold] = await listListingHoldsByCompany(db(), companyId);
    expect(hold?.capturedAt?.toISOString()).toBe(approvedAt.toISOString());
  });

  it("FR-114: a failed subscription start keeps the confirmed capture and queues a retry", async () => {
    const { stripe, companyId, pi } = await approvedAndCaptureRequested();
    stripe.deps.createSubscription = () =>
      Promise.reject(new Error("Stripe 503"));

    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);

    const [hold] = await listListingHoldsByCompany(db(), companyId);
    expect(hold?.status).toBe("succeeded");
    expect(await companyListingIsPaid(db(), companyId, NOW)).toBe(true);

    const queued = await db()
      .select()
      .from(outbox)
      .where(eq(outbox.topic, LISTING_HOLD_SETTLE_TOPIC));
    expect(
      queued.some(
        (row) =>
          (row.payload as { companyId?: string }).companyId === companyId,
      ),
    ).toBe(true);
  });

  it("FR-115: a queued refund does not refund a company restored in the meantime", async () => {
    const { stripe, companyId, pi } = await approvedAndCaptureRequested();
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);

    await enqueueOutbox(db(), BILLING_REFUND_RETRY_TOPIC, { companyId });
    // Still approved when the retry drains.
    await runOutboxDrain(INLINE_BATCH_SIZE, {
      db: getTestDb() as unknown as Db,
      fetchSubscription: () => Promise.reject(new Error("unexpected")),
      listingHold: stripe.deps,
    });

    expect(stripe.ops("refund")).toHaveLength(0);
    expect(await companyListingIsPaid(db(), companyId, NOW)).toBe(true);
  });
});

describe("FR-119: a club member's own company goes the same way", () => {
  it("FR-119: a member reserves, is approved, and is published on Stripe's confirmation", async () => {
    const stripe = fakeStripe();
    const { memberId, companyId } = await seedPartner("pending", "paying");

    const opened = await openListingHoldCheckout(db(), stripe.deps, {
      memberId,
      companyId,
      stripeCustomerId: "cus_test",
      receiptEmail: "member@example.test",
      priceId: "price_listing",
      successUrl: "https://kclub.test/ok",
      cancelUrl: "https://kclub.test/cancel",
      now: NOW,
    });
    expect(opened.outcome).toBe("opened");

    const pi = stripe.authorise({ companyId, memberId });
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);
    await setCompanyModerationStatus(db(), companyId, "approved", null);
    await settleListingHolds(db(), stripe.deps, companyId, NOW);
    expect(await companyListingIsPaid(db(), companyId, NOW)).toBe(false);

    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);
    expect(await companyListingIsPaid(db(), companyId, NOW)).toBe(true);
    expect(stripe.ops("subscription")).toHaveLength(1);
  });

  it("FR-119: an approved but unpaid company reserves, and the reservation is captured at once", async () => {
    const stripe = fakeStripe();
    const { memberId, companyId } = await seedPartner("pending", "paying");
    await setCompanyModerationStatus(db(), companyId, "approved", null);

    const pi = stripe.authorise({ companyId, memberId });
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);

    expect(stripe.ops("capture")).toHaveLength(1);
    await projectListingHold(db(), stripe.deps, pi, nextEvent(), NOW);
    expect(await companyListingIsPaid(db(), companyId, NOW)).toBe(true);
  });
});
