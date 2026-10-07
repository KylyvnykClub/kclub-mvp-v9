import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import type { DbClient } from "@/data/db";
import {
  cancelListingRenewal,
  type ListingCancellationDeps,
} from "./listing-cancellation";

/** `listSubscriptionsByCompanyId` is one relational findMany. */
function dbWith(
  rows: {
    stripeSubscriptionId: string;
    status: string;
    cancelAtPeriodEnd: Date | null;
  }[],
): DbClient {
  return {
    query: { subscriptions: { findMany: () => Promise.resolve(rows) } },
  } as unknown as DbClient;
}

function deps(endsAt: number) {
  const updateSubscription = vi.fn(
    (id: string, _params: Stripe.SubscriptionUpdateParams) =>
      Promise.resolve({
        id,
        cancel_at: endsAt,
        trial_end: null,
        items: { data: [] },
      } as unknown as Stripe.Subscription),
  );
  return {
    updateSubscription,
    cancelSubscription: vi.fn(),
  } satisfies ListingCancellationDeps;
}

describe("ADR 0044 §4: Cancel auto-renewal", () => {
  it("sets cancel_at_period_end on a trialing listing - no invoice, the free month runs out", async () => {
    const stripe = deps(1_800_000_000);
    const result = await cancelListingRenewal(
      dbWith([
        {
          stripeSubscriptionId: "sub_t",
          status: "trialing",
          cancelAtPeriodEnd: null,
        },
      ]),
      stripe,
      "company",
    );
    expect(result).toEqual({
      outcome: "cancelled",
      subscriptionId: "sub_t",
      endsAt: new Date(1_800_000_000 * 1000),
    });
    expect(stripe.updateSubscription).toHaveBeenCalledWith("sub_t", {
      cancel_at_period_end: true,
      proration_behavior: "none",
    });
  });

  it("does nothing more for a renewal already cancelled", async () => {
    const stripe = deps(1);
    const endsAt = new Date("2026-11-30T00:00:00Z");
    expect(
      await cancelListingRenewal(
        dbWith([
          {
            stripeSubscriptionId: "sub_a",
            status: "active",
            cancelAtPeriodEnd: endsAt,
          },
        ]),
        stripe,
        "company",
      ),
    ).toEqual({
      outcome: "already_cancelled",
      subscriptionId: "sub_a",
      endsAt,
    });
    expect(stripe.updateSubscription).not.toHaveBeenCalled();
  });

  it("finds nothing to cancel once the subscription has ended", async () => {
    const stripe = deps(1);
    expect(
      await cancelListingRenewal(
        dbWith([
          {
            stripeSubscriptionId: "sub_c",
            status: "canceled",
            cancelAtPeriodEnd: null,
          },
        ]),
        stripe,
        "company",
      ),
    ).toEqual({ outcome: "nothing_to_cancel" });
  });
});
