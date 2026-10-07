import { describe, expect, it } from "vitest";

import {
  addOneMonth,
  holdIsCapturable,
  holdPaysForListing,
  partnerPaymentStanding,
  planListingHoldSettlement,
  type ListingHoldState,
} from "./listing-hold";

/**
 * ADR 0037: a partner's card is held at application, captured on approval and
 * released on rejection, and the listing goes live only once Stripe has
 * confirmed the capture.
 *
 * Every case here is one where getting it wrong moves money the wrong way.
 */

const NOW = new Date("2026-09-26T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function hold(overrides: Partial<ListingHoldState> = {}): ListingHoldState {
  return {
    stripePaymentIntentId: "pi_1",
    status: "requires_capture",
    captureBefore: new Date(NOW.getTime() + 5 * 24 * HOUR),
    captureRequestedAt: null,
    capturedAt: null,
    coversUntil: null,
    refundedAt: null,
    stripeSubscriptionId: null,
    createdAt: new Date(NOW.getTime() - HOUR),
    ...overrides,
  };
}

function captured(overrides: Partial<ListingHoldState> = {}) {
  return hold({
    status: "succeeded",
    capturedAt: new Date(NOW.getTime() - HOUR),
    coversUntil: addOneMonth(new Date(NOW.getTime() - HOUR)),
    ...overrides,
  });
}

function plan(
  moderationStatus: string | null,
  holds: ListingHoldState[],
  listingSubscriptionActive = false,
) {
  return planListingHoldSettlement({
    moderationStatus,
    holds,
    listingSubscriptionActive,
    now: NOW,
  });
}

describe("FR-114: approval captures the held payment", () => {
  it("FR-114: captures the one authorised hold of an approved company", () => {
    expect(plan("approved", [hold()])).toEqual([
      { kind: "capture", paymentIntentId: "pi_1" },
    ]);
  });

  it("FR-114: never captures anything while the application is pending", () => {
    expect(plan("pending", [hold()])).toEqual([]);
  });

  it("FR-114: does not try to capture an authorisation that has expired", () => {
    const expired = hold({ captureBefore: new Date(NOW.getTime() - 1) });
    expect(plan("approved", [expired])).toEqual([
      { kind: "cancel", paymentIntentId: "pi_1" },
    ]);
  });

  it("FR-114: does not capture a hold Stripe already cancelled", () => {
    expect(plan("approved", [hold({ status: "canceled" })])).toEqual([]);
  });

  it("FR-114: captures the newest of two holds and releases the other", () => {
    const older = hold({
      stripePaymentIntentId: "pi_old",
      createdAt: new Date(NOW.getTime() - 3 * HOUR),
    });
    const newer = hold({ stripePaymentIntentId: "pi_new" });

    expect(plan("approved", [older, newer])).toEqual([
      { kind: "capture", paymentIntentId: "pi_new" },
      { kind: "cancel", paymentIntentId: "pi_old" },
    ]);
  });

  it("FR-114: a retry captures the hold already asked for, never a second one", () => {
    const asked = hold({
      stripePaymentIntentId: "pi_asked",
      captureRequestedAt: new Date(NOW.getTime() - 60_000),
      createdAt: new Date(NOW.getTime() - 3 * HOUR),
    });
    const newer = hold({ stripePaymentIntentId: "pi_new" });

    expect(plan("approved", [asked, newer])).toEqual([
      { kind: "capture", paymentIntentId: "pi_asked" },
      { kind: "cancel", paymentIntentId: "pi_new" },
    ]);
  });

  it("FR-114: an already paid listing releases any further hold instead of charging twice", () => {
    const paid = captured({
      stripePaymentIntentId: "pi_paid",
      stripeSubscriptionId: "sub_1",
    });
    const extra = hold({ stripePaymentIntentId: "pi_extra" });

    expect(plan("approved", [paid, extra])).toEqual([
      { kind: "cancel", paymentIntentId: "pi_extra" },
    ]);
  });

  it("FR-114: an active listing subscription also counts as paid", () => {
    expect(plan("approved", [hold()], true)).toEqual([
      { kind: "cancel", paymentIntentId: "pi_1" },
    ]);
  });

  it("FR-114: leaves a payment Stripe is still processing alone", () => {
    expect(plan("approved", [hold({ status: "processing" })])).toEqual([]);
  });
});

describe("FR-116: the monthly subscription starts after the first confirmed capture", () => {
  it("FR-116: starts it once the capture is confirmed", () => {
    expect(plan("approved", [captured()])).toEqual([
      { kind: "start_subscription", paymentIntentId: "pi_1" },
    ]);
  });

  it("FR-116: does not start a second one", () => {
    expect(
      plan("approved", [captured({ stripeSubscriptionId: "sub_1" })]),
    ).toEqual([]);
  });

  it("FR-116: does not start one when a listing subscription already exists", () => {
    expect(plan("approved", [captured()], true)).toEqual([]);
  });

  it("FR-116: does not start one from a refunded capture", () => {
    const refunded = captured({ refundedAt: NOW });
    expect(plan("approved", [refunded])).toEqual([]);
  });

  it("FR-116: never starts one for a company that is no longer approved", () => {
    expect(plan("rejected", [captured()])).toEqual([]);
    expect(plan("pending", [captured()])).toEqual([]);
  });
});

describe("FR-115: rejection releases the hold", () => {
  it("FR-115: cancels an authorised hold", () => {
    expect(plan("rejected", [hold()])).toEqual([
      { kind: "cancel", paymentIntentId: "pi_1" },
    ]);
  });

  it("FR-115: also cancels a checkout still waiting for a card, so it cannot complete later", () => {
    expect(
      plan("rejected", [hold({ status: "requires_payment_method" })]),
    ).toEqual([{ kind: "cancel", paymentIntentId: "pi_1" }]);
  });

  it("FR-115: releases everything when the company no longer exists", () => {
    expect(plan(null, [hold()])).toEqual([
      { kind: "cancel", paymentIntentId: "pi_1" },
    ]);
  });

  it("FR-115: never captures for a rejected company", () => {
    const actions = plan("rejected", [
      hold(),
      hold({ stripePaymentIntentId: "pi_2" }),
    ]);
    expect(actions.every((a) => a.kind === "cancel")).toBe(true);
  });

  it("FR-115: has nothing to cancel once Stripe has already cancelled", () => {
    expect(plan("rejected", [hold({ status: "canceled" })])).toEqual([]);
  });
});

describe("FR-113: while in review at most one authorisation is kept", () => {
  it("FR-113: keeps a single hold", () => {
    expect(plan("pending", [hold()])).toEqual([]);
  });

  it("FR-113: releases a second hold completed in another tab", () => {
    const first = hold({
      stripePaymentIntentId: "pi_first",
      createdAt: new Date(NOW.getTime() - 2 * HOUR),
    });
    const second = hold({ stripePaymentIntentId: "pi_second" });

    expect(plan("pending", [first, second])).toEqual([
      { kind: "cancel", paymentIntentId: "pi_first" },
    ]);
  });

  it("FR-113: does not cancel a checkout the applicant may still be retrying", () => {
    expect(
      plan("pending", [hold({ status: "requires_payment_method" })]),
    ).toEqual([]);
  });
});

describe("FR-114: only a confirmed capture pays for the listing", () => {
  it("FR-114: an authorised hold is not a payment", () => {
    expect(holdPaysForListing(hold(), NOW)).toBe(false);
  });

  it("FR-114: a capture asked for but not yet confirmed is not a payment", () => {
    expect(holdPaysForListing(hold({ captureRequestedAt: NOW }), NOW)).toBe(
      false,
    );
  });

  it("FR-114: a confirmed capture pays until the end of its month", () => {
    const paid = captured();
    expect(holdPaysForListing(paid, NOW)).toBe(true);
    expect(holdPaysForListing(paid, paid.coversUntil!)).toBe(false);
  });

  it("FR-114: a refunded capture pays for nothing", () => {
    expect(holdPaysForListing(captured({ refundedAt: NOW }), NOW)).toBe(false);
  });

  it("FR-114: an authorisation stops being capturable the moment it expires", () => {
    const deadline = new Date(NOW.getTime() + HOUR);
    const h = hold({ captureBefore: deadline });
    expect(holdIsCapturable(h, new Date(deadline.getTime() - 1))).toBe(true);
    expect(holdIsCapturable(h, deadline)).toBe(false);
  });
});

describe("FR-116: one calendar month", () => {
  it("FR-116: adds a month on an ordinary date", () => {
    expect(
      addOneMonth(new Date("2026-09-26T12:34:56.000Z")).toISOString(),
    ).toBe("2026-10-26T12:34:56.000Z");
  });

  it("FR-116: clamps 31 January to the end of February", () => {
    expect(
      addOneMonth(new Date("2027-01-31T08:00:00.000Z")).toISOString(),
    ).toBe("2027-02-28T08:00:00.000Z");
    expect(
      addOneMonth(new Date("2028-01-31T08:00:00.000Z")).toISOString(),
    ).toBe("2028-02-29T08:00:00.000Z");
  });

  it("FR-116: rolls December into the next year", () => {
    expect(
      addOneMonth(new Date("2026-12-15T00:00:00.000Z")).toISOString(),
    ).toBe("2027-01-15T00:00:00.000Z");
  });
});

describe("FR-113: what the partner is told", () => {
  function standing(
    moderationStatus: string,
    holds: ListingHoldState[],
    listingSubscriptionActive = false,
  ) {
    return partnerPaymentStanding({
      moderationStatus,
      holds,
      listingSubscriptionActive,
      now: NOW,
    });
  }

  it("FR-113: asks for the card when nothing is held", () => {
    expect(standing("pending", [])).toBe("authorise");
  });

  it("FR-113: says the price is held, not charged, while in review", () => {
    expect(standing("pending", [hold()])).toBe("held");
  });

  it("FR-113: asks again once the authorisation has lapsed", () => {
    expect(standing("pending", [hold({ status: "canceled" })])).toBe(
      "authorise",
    );
  });

  it("FR-114: says the payment is being confirmed between approval and the webhook", () => {
    expect(standing("approved", [hold({ captureRequestedAt: NOW })])).toBe(
      "confirming",
    );
  });

  it("FR-114: asks for payment when an approved company has nothing capturable", () => {
    expect(standing("approved", [hold({ status: "canceled" })])).toBe("pay");
    expect(standing("approved", [])).toBe("pay");
  });

  it("FR-114: is paid once the capture is confirmed", () => {
    expect(standing("approved", [captured()])).toBe("paid");
    expect(standing("approved", [], true)).toBe("paid");
  });

  it("FR-114: asks for payment again when the first paid month is over and nothing renewed it", () => {
    const lapsed = captured({
      capturedAt: new Date("2026-07-01T00:00:00.000Z"),
      coversUntil: new Date("2026-08-01T00:00:00.000Z"),
    });
    expect(standing("approved", [lapsed])).toBe("pay");
  });

  it("FR-115: a rejection is a rejection whatever the card says", () => {
    expect(standing("rejected", [hold()])).toBe("rejected");
  });
});

describe("FR-105, ADR 0040: a listing waived by the partner link is never asked for money", () => {
  const standing = (moderationStatus: string, holds: ListingHoldState[] = []) =>
    partnerPaymentStanding({
      moderationStatus,
      holds,
      listingSubscriptionActive: false,
      listingWaived: true,
      now: NOW,
    });

  it("FR-105: waits in review without asking for the card", () => {
    expect(standing("pending")).toBe("waived");
  });

  it("FR-110: counts as paid once approved", () => {
    expect(standing("approved")).toBe("paid");
  });

  it("FR-105: is still refused like any other application", () => {
    expect(standing("rejected")).toBe("rejected");
  });
});

describe("ADR 0044: the standing of an application paid by a saved card", () => {
  const base = {
    holds: [],
    listingSubscriptionActive: false,
    now: new Date("2026-10-07T12:00:00Z"),
  };
  const noCard = { cardSavedAt: null, startNotBefore: null };
  const card = {
    cardSavedAt: new Date("2026-10-07T10:00:00Z"),
    startNotBefore: null,
  };

  it("asks for the card until Stripe confirms it was saved", () => {
    expect(
      partnerPaymentStanding({
        ...base,
        moderationStatus: "pending",
        activation: noCard,
      }),
    ).toBe("save_card");
  });

  it("waits for review with the card saved, never asking for a hold", () => {
    expect(
      partnerPaymentStanding({
        ...base,
        moderationStatus: "pending",
        activation: card,
      }),
    ).toBe("card_saved");
  });

  it("is starting once approved, and scheduled while an EU consumer's 14 days run", () => {
    expect(
      partnerPaymentStanding({
        ...base,
        moderationStatus: "approved",
        activation: card,
      }),
    ).toBe("starting");
    expect(
      partnerPaymentStanding({
        ...base,
        moderationStatus: "approved",
        activation: {
          ...card,
          startNotBefore: new Date("2026-10-21T12:00:00Z"),
        },
      }),
    ).toBe("scheduled");
  });

  it("reads trial while the subscription is trialing, and paid once it is active", () => {
    expect(
      partnerPaymentStanding({
        ...base,
        moderationStatus: "approved",
        activation: card,
        listingSubscriptionTrialing: true,
      }),
    ).toBe("trial");
    expect(
      partnerPaymentStanding({
        ...base,
        moderationStatus: "approved",
        activation: card,
        listingSubscriptionActive: true,
      }),
    ).toBe("paid");
  });

  it("says withdrawn rather than rejected when the owner withdrew", () => {
    expect(
      partnerPaymentStanding({
        ...base,
        moderationStatus: "rejected",
        activation: card,
        withdrawn: true,
      }),
    ).toBe("withdrawn");
  });
});
