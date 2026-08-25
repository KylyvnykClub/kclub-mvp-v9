import { describe, expect, it } from "vitest";

import {
  ACCESS_GRANTING_SUBSCRIPTION_STATUSES,
  GRACE_PERIOD_DAYS,
  tierForSubscriptionStatus,
} from "@/data/billing-access.js";

/**
 * ADR 0004 / FR-056: money and access must never disagree. The card tier is
 * projected from the subscription status through the single rule
 * tierForSubscriptionStatus, and whether a failed payment ever loses access is
 * decided by Stripe's end-of-dunning action - a dashboard setting the code
 * cannot read. These lock the code half of that coupling:
 *   - every terminal status demotes to free, whichever dunning action Stripe is
 *     configured with (cancel -> deleted, mark-unpaid -> unpaid);
 *   - the grace window the code assumes matches the Stripe retry window.
 * Backlog: stripe-dunning-settings-are-config-not-code.
 */

describe("constraint: subscription status grants access (ADR 0004)", () => {
  it("grants vip only for active and past_due", () => {
    expect(tierForSubscriptionStatus("active")).toBe("vip");
    expect(tierForSubscriptionStatus("past_due")).toBe("vip");
  });

  it.each([
    "unpaid", // Stripe dunning action "mark as unpaid"
    "canceled", // Stripe dunning action "cancel the subscription"
    "deleted", // the projection's terminal state after subscription.deleted
    "incomplete",
    "incomplete_expired",
    "paused",
    "trialing",
    "",
    "something_new_stripe_invents",
  ])("demotes %s to free", (status) => {
    expect(tierForSubscriptionStatus(status)).toBe("free");
  });

  it("keeps the access-granting set to exactly active and past_due", () => {
    expect([...ACCESS_GRANTING_SUBSCRIPTION_STATUSES].sort()).toEqual([
      "active",
      "past_due",
    ]);
  });
});

describe("constraint: grace window matches the Stripe dunning schedule (FR-056)", () => {
  it("pins GRACE_PERIOD_DAYS to the configured Stripe Smart Retries window (2 weeks)", () => {
    // Stripe is configured to retry up to 8 times within 2 weeks and then
    // cancel the subscription. If that dashboard schedule changes, this must
    // change with it - and this test failing is the reminder to reconfigure
    // Stripe, not just to edit the number. See docs/integration.md.
    expect(GRACE_PERIOD_DAYS).toBe(14);
  });
});
