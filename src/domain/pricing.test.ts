import { describe, expect, it } from "vitest";

import {
  MONTHLY_PRICE_MINOR,
  formatPrice,
  monthlyPrice,
  pricingDestinations,
} from "./pricing";

describe("FR-102: the published prices are integer minor units", () => {
  it("prices membership at $4.99 a month", () => {
    expect(MONTHLY_PRICE_MINOR.membership).toBe(499);
  });

  it("leaves VIP and a listing at $19.99 a month", () => {
    expect(MONTHLY_PRICE_MINOR.vip).toBe(1999);
    expect(MONTHLY_PRICE_MINOR.listing).toBe(1999);
  });

  it("every amount is an integer, so no float ever reaches a price", () => {
    for (const amount of Object.values(MONTHLY_PRICE_MINOR)) {
      expect(Number.isInteger(amount)).toBe(true);
    }
  });

  it("renders the amount with an explicit currency symbol", () => {
    expect(formatPrice(499, "en")).toBe("$4.99");
    expect(monthlyPrice("vip", "en")).toBe("$19.99");
  });
});

describe("FR-103: each pricing button arrives at the price it names", () => {
  it("sends a visitor to sign-up, and a business to the partner application", () => {
    expect(pricingDestinations({ signedIn: false }, "ru")).toEqual({
      membership: "/ru/register",
      vip: "/ru/register?plan=vip",
      listing: "/ru/partner",
    });
  });

  it("never sends an unpaid member into the gated dashboard", () => {
    const unpaid = pricingDestinations(
      { signedIn: true, awaitingPayment: true, ownsCompany: false },
      "uk",
    );
    expect(
      Object.values(unpaid).some((href) => href.includes("/dashboard")),
    ).toBe(false);
    expect(unpaid.listing).toBe("/uk/partner");
    expect(unpaid.vip).toBe("/uk/membership?plan=vip");
  });

  it("sends an unpaid member who already has a company to its standing", () => {
    expect(
      pricingDestinations(
        { signedIn: true, awaitingPayment: true, ownsCompany: true },
        "en",
      ).listing,
    ).toBe("/en/membership");
  });

  it("sends a paid member to Billing for VIP and to the dashboard form for a listing", () => {
    expect(
      pricingDestinations(
        { signedIn: true, awaitingPayment: false, ownsCompany: false },
        "ru",
      ),
    ).toEqual({
      membership: "/ru/membership",
      vip: "/ru/dashboard/profile?tab=billing",
      listing: "/ru/dashboard/company/new",
    });
  });
});
