import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "@/data/db";
import {
  refundIdempotencyKey,
  refundListingForCompany,
  type RefundDeps,
} from "./refund";

/**
 * FR-101 / ADR 0019: rejecting a company that already paid must cancel its
 * listing subscription and refund the last invoice.
 *
 * The Stripe side is injected, so these exercise the policy - which
 * subscription counts, what happens when nothing was charged, and that a
 * repeated rejection cannot refund twice - without a Stripe account.
 */

const COMPANY = "11111111-1111-1111-1111-111111111111";

/**
 * `refundListingForCompany` reaches the database only through
 * `listSubscriptionsByCompanyId`, which is a single `db.query...findMany`. This
 * stands in for it so the policy can be tested without the integration harness.
 */
function dbWithSubscriptions(
  rows: { stripeSubscriptionId: string; status: string }[],
): DbClient {
  return {
    query: { subscriptions: { findMany: () => Promise.resolve(rows) } },
  } as unknown as DbClient;
}

function deps(overrides: Partial<RefundDeps> = {}): RefundDeps {
  return {
    cancelSubscription: vi.fn(() => Promise.resolve({})),
    latestPaidInvoice: vi.fn(() =>
      Promise.resolve({
        invoiceId: "in_1",
        target: { paymentIntentId: "pi_1" },
        amountMinor: 1999,
      }),
    ),
    issueRefund: vi.fn(() => Promise.resolve({})),
    ...overrides,
  };
}

describe("FR-101: a rejection undoes the listing payment (ADR 0019)", () => {
  it("FR-101: cancels the subscription and refunds the last invoice", async () => {
    const d = deps();
    const result = await refundListingForCompany(
      dbWithSubscriptions([
        { stripeSubscriptionId: "sub_1", status: "active" },
      ]),
      d,
      COMPANY,
    );

    expect(result).toEqual({
      outcome: "refunded",
      subscriptionId: "sub_1",
      invoiceId: "in_1",
      amountMinor: 1999,
    });
    expect(d.cancelSubscription).toHaveBeenCalledWith("sub_1");
    expect(d.issueRefund).toHaveBeenCalledWith(
      { paymentIntentId: "pi_1" },
      refundIdempotencyKey(COMPANY, "sub_1"),
    );
  });

  it("FR-101: refunds a past_due subscription too, since it still publishes the listing", async () => {
    const d = deps();
    const result = await refundListingForCompany(
      dbWithSubscriptions([
        { stripeSubscriptionId: "sub_pd", status: "past_due" },
      ]),
      d,
      COMPANY,
    );

    expect(result.outcome).toBe("refunded");
    expect(d.cancelSubscription).toHaveBeenCalledWith("sub_pd");
  });

  it("FR-101: cancels but does not refund when nothing was ever charged", async () => {
    const d = deps({ latestPaidInvoice: vi.fn(() => Promise.resolve(null)) });
    const result = await refundListingForCompany(
      dbWithSubscriptions([
        { stripeSubscriptionId: "sub_2", status: "active" },
      ]),
      d,
      COMPANY,
    );

    expect(result).toEqual({
      outcome: "cancelled_unpaid",
      subscriptionId: "sub_2",
    });
    expect(d.cancelSubscription).toHaveBeenCalledWith("sub_2");
    expect(d.issueRefund).not.toHaveBeenCalled();
  });

  it("FR-101: does nothing when checkout was abandoned and no subscription exists", async () => {
    const d = deps();
    const result = await refundListingForCompany(
      dbWithSubscriptions([]),
      d,
      COMPANY,
    );

    expect(result).toEqual({ outcome: "nothing_to_refund" });
    expect(d.cancelSubscription).not.toHaveBeenCalled();
    expect(d.issueRefund).not.toHaveBeenCalled();
  });

  it("FR-101: leaves an already-lapsed subscription alone - its money question was settled when it lapsed", async () => {
    const d = deps();
    const result = await refundListingForCompany(
      dbWithSubscriptions([
        { stripeSubscriptionId: "sub_gone", status: "canceled" },
        { stripeSubscriptionId: "sub_dead", status: "deleted" },
        { stripeSubscriptionId: "sub_unpaid", status: "unpaid" },
      ]),
      d,
      COMPANY,
    );

    expect(result).toEqual({ outcome: "nothing_to_refund" });
    expect(d.cancelSubscription).not.toHaveBeenCalled();
  });

  it("FR-101: refunds a bare charge when Stripe surfaced no payment intent", async () => {
    const d = deps({
      latestPaidInvoice: vi.fn(() =>
        Promise.resolve({
          invoiceId: "in_old",
          target: { chargeId: "ch_old" },
          amountMinor: 1999,
        }),
      ),
    });

    await refundListingForCompany(
      dbWithSubscriptions([
        { stripeSubscriptionId: "sub_3", status: "active" },
      ]),
      d,
      COMPANY,
    );

    expect(d.issueRefund).toHaveBeenCalledWith(
      { chargeId: "ch_old" },
      refundIdempotencyKey(COMPANY, "sub_3"),
    );
  });

  it("FR-101: rejecting twice refunds once, because the key is the same both times", () => {
    // The status guard in setCompanyModerationStatus stops the second attempt
    // before it reaches Stripe. This pins the second line of defence: if one
    // ever did get through, Stripe would deduplicate it - which requires the
    // key to carry no timestamp, unlike the checkout key's minute bucket.
    const first = refundIdempotencyKey(COMPANY, "sub_1");
    const second = refundIdempotencyKey(COMPANY, "sub_1");

    expect(first).toBe(second);
    expect(first).not.toMatch(/\d{13}/);
    expect(refundIdempotencyKey(COMPANY, "sub_other")).not.toBe(first);
  });
});
