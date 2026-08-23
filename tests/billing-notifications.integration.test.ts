import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DbClient } from "@/data/db.js";
import { getTestDb } from "./setup/integration-setup.js";
import {
  BILLING_NOTIFICATION_TOPIC,
  GRACE_EXPIRY_WARNING_NOTIFICATION,
  PAYMENT_FAILED_NOTIFICATION,
  countPending,
  enqueueOutbox,
} from "@/data/outbox.js";
import { members, stripeCustomers } from "@/data/schema/index.js";

/**
 * The outbox consumer, asserted without touching Resend or Stripe.
 *
 * `outbox-worker.ts` reaches `@/env`, `stripe` and the email module through
 * *dynamic* imports precisely so it stays importable by a suite that has no
 * secrets — which also makes all three mockable at file level. This is a
 * separate file from billing-projection because `vi.mock` is file-scoped and
 * the projection suite must not run under a stubbed `@/env`.
 *
 * Until 2026-08-23 nothing in this repository asserted that any email was ever
 * sent. These cases cover both halves of FR-056's notification requirement.
 */

const CUSTOMER_EMAIL = "member@example.com";

vi.mock("@/env", () => ({
  env: {
    server: {
      STRIPE_SECRET_KEY: "sk_test_stub_for_the_integration_suite",
      RESEND_API_KEY: undefined,
    },
  },
}));

vi.mock("stripe", () => ({
  default: class StripeStub {
    customers = {
      retrieve: (id: string) =>
        Promise.resolve({ id, email: CUSTOMER_EMAIL, deleted: false }),
    };
    subscriptions = {
      retrieve: () => Promise.reject(new Error("not used in these cases")),
    };
  },
}));

vi.mock("@/modules/notifications/email", () => ({
  sendPaymentFailedEmail: vi.fn(() => Promise.resolve(true)),
  sendGraceExpiryWarningEmail: vi.fn(() => Promise.resolve(true)),
  sendCompanyApprovedEmail: vi.fn(() => Promise.resolve(true)),
  sendCompanyRejectedEmail: vi.fn(() => Promise.resolve(true)),
}));

const { sendPaymentFailedEmail, sendGraceExpiryWarningEmail } =
  await import("@/modules/notifications/email");
const { CRON_BATCH_SIZE, runOutboxDrain } =
  await import("@/modules/platform/outbox-worker.js");

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

/** runOutboxDrain wants the full neon Db shape; the harness supplies node-postgres. */
function drainDeps() {
  return {
    db: getTestDb() as never,
    fetchSubscription: () =>
      Promise.reject(new Error("no subscription fetch in these cases")),
  };
}

const CUSTOMER_ID = "cus_notification_test";

async function seedMemberWithCustomer(
  db: DbClient,
  language: string,
): Promise<{ memberId: string; displayName: string }> {
  const memberId = crypto.randomUUID();
  const displayName = "Grace Test";

  await db.insert(members).values({
    id: memberId,
    phone: `+1${Math.floor(1_000_000_000 + Math.random() * 9_000_000_000)}`,
    passwordHash: "hash",
    displayName,
    country: "US",
    language,
  });
  await db.insert(stripeCustomers).values({
    memberId,
    stripeCustomerId: CUSTOMER_ID,
  });

  return { memberId, displayName };
}

describe("billing notifications (FR-056)", () => {
  beforeEach(() => {
    vi.mocked(sendPaymentFailedEmail).mockClear();
    vi.mocked(sendGraceExpiryWarningEmail).mockClear();
  });

  it("FR-056: draining a grace expiry warning sends the warning once, in the member's language", async () => {
    const db = testDbClient();
    const { displayName } = await seedMemberWithCustomer(db, "uk");

    await enqueueOutbox(db, BILLING_NOTIFICATION_TOPIC, {
      type: GRACE_EXPIRY_WARNING_NOTIFICATION,
      subscriptionId: "sub_grace",
      customerId: CUSTOMER_ID,
    });

    const result = await runOutboxDrain(CRON_BATCH_SIZE, drainDeps());

    expect(result.notified).toBe(1);
    expect(result.failed).toBe(0);
    expect(sendGraceExpiryWarningEmail).toHaveBeenCalledTimes(1);
    expect(sendGraceExpiryWarningEmail).toHaveBeenCalledWith({
      to: CUSTOMER_EMAIL,
      displayName,
      locale: "uk",
    });
    expect(sendPaymentFailedEmail).not.toHaveBeenCalled();
    expect(await countPending(db)).toBe(0);
  });

  it("FR-056: a drained warning is not sent again by the next drain", async () => {
    const db = testDbClient();
    await seedMemberWithCustomer(db, "en");

    await enqueueOutbox(db, BILLING_NOTIFICATION_TOPIC, {
      type: GRACE_EXPIRY_WARNING_NOTIFICATION,
      subscriptionId: "sub_grace",
      customerId: CUSTOMER_ID,
    });

    await runOutboxDrain(CRON_BATCH_SIZE, drainDeps());
    await runOutboxDrain(CRON_BATCH_SIZE, drainDeps());

    expect(sendGraceExpiryWarningEmail).toHaveBeenCalledTimes(1);
    expect(await countPending(db)).toBe(0);
  });

  it("FR-056: the payment failure notice still sends, in the member's language", async () => {
    const db = testDbClient();
    const { displayName } = await seedMemberWithCustomer(db, "ru");

    await enqueueOutbox(db, BILLING_NOTIFICATION_TOPIC, {
      type: PAYMENT_FAILED_NOTIFICATION,
      subscriptionId: "sub_failed",
      customerId: CUSTOMER_ID,
      attemptCount: 2,
    });

    await runOutboxDrain(CRON_BATCH_SIZE, drainDeps());

    expect(sendPaymentFailedEmail).toHaveBeenCalledTimes(1);
    expect(sendPaymentFailedEmail).toHaveBeenCalledWith({
      to: CUSTOMER_EMAIL,
      displayName,
      locale: "ru",
    });
    expect(sendGraceExpiryWarningEmail).not.toHaveBeenCalled();
  });

  it("FR-056: an unhandled notification type sends nothing and does not jam the outbox", async () => {
    const db = testDbClient();
    await seedMemberWithCustomer(db, "en");

    await enqueueOutbox(db, BILLING_NOTIFICATION_TOPIC, {
      type: "a_type_nobody_handles_yet",
      customerId: CUSTOMER_ID,
    });

    const result = await runOutboxDrain(CRON_BATCH_SIZE, drainDeps());

    expect(sendPaymentFailedEmail).not.toHaveBeenCalled();
    expect(sendGraceExpiryWarningEmail).not.toHaveBeenCalled();
    // Marked processed rather than left to retry: a type nobody handles never
    // gets better, and a row that is never marked is re-selected by every
    // drain — which since ADR 0017 means every Stripe webhook.
    expect(result.failed).toBe(0);
    expect(await countPending(db)).toBe(0);
  });
});
