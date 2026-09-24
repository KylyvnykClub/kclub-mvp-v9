import { describe, expect, it } from "vitest";

import {
  listingCheckoutEligibility,
  listingIsPayable,
} from "./listing-checkout";

/**
 * FR-111: nothing is charged for a listing before a human has approved the
 * application.
 *
 * ADR 0019 had the opposite rule — submission handed straight off to checkout
 * — and paid for it with a refund on every rejection. These are the cases that
 * would fail if that order came back.
 */
describe("FR-111: a listing is payable only after approval", () => {
  it("lets an approved company pay", () => {
    expect(listingCheckoutEligibility({ moderationStatus: "approved" })).toBe(
      "eligible",
    );
    expect(listingIsPayable({ moderationStatus: "approved" })).toBe(true);
  });

  it("refuses a company still waiting for a moderator", () => {
    expect(listingCheckoutEligibility({ moderationStatus: "pending" })).toBe(
      "awaiting_moderation",
    );
    expect(listingIsPayable({ moderationStatus: "pending" })).toBe(false);
  });

  it("refuses a rejected company, which has nothing to sell", () => {
    expect(listingCheckoutEligibility({ moderationStatus: "rejected" })).toBe(
      "rejected",
    );
    expect(listingIsPayable({ moderationStatus: "rejected" })).toBe(false);
  });

  it("refuses a company that does not exist or is not the caller's", () => {
    expect(listingCheckoutEligibility(null)).toBe("unknown");
    expect(listingCheckoutEligibility(undefined)).toBe("unknown");
    expect(listingIsPayable(null)).toBe(false);
  });

  it("refuses a moderation status it has never heard of", () => {
    // A status added later must not become payable by default; only the word
    // "approved" opens Stripe.
    expect(
      listingCheckoutEligibility({ moderationStatus: "changes_requested" }),
    ).toBe("awaiting_moderation");
    expect(listingIsPayable({ moderationStatus: "" })).toBe(false);
  });
});
