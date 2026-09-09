import { describe, expect, it } from "vitest";

import { MONTHLY_PRICE_MINOR, formatPrice, monthlyPrice } from "./pricing";

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
