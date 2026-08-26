import { describe, expect, it } from "vitest";
import { checkoutIdempotencyKey, resolveCheckoutPriceId } from "./checkout";

describe("billing checkout contract", () => {
  it("resolves VIP and listing prices from server-owned config", () => {
    expect(
      resolveCheckoutPriceId("vip", {
        vipPriceId: "price_vip",
        legacyVipPriceId: "price_legacy_vip",
      }),
    ).toBe("price_vip");

    expect(
      resolveCheckoutPriceId("listing", {
        businessPriceId: "price_listing",
        legacyBusinessPriceId: "price_legacy_listing",
      }),
    ).toBe("price_listing");
  });

  it("keeps legacy public price ids as a temporary server-side fallback", () => {
    expect(
      resolveCheckoutPriceId("vip", {
        legacyVipPriceId: "price_legacy_vip",
      }),
    ).toBe("price_legacy_vip");
  });

  it("fails closed when a plan price is missing", () => {
    expect(() => resolveCheckoutPriceId("listing", {})).toThrow(
      "listing checkout price is not configured",
    );
  });

  it("generates a stable per-minute idempotency key for duplicate clicks", () => {
    const now = new Date("2026-08-11T12:30:20Z");
    const nextMinute = new Date("2026-08-11T12:31:00Z");
    const input = {
      memberId: "member_1",
      plan: "listing" as const,
      priceId: "price_listing",
      companyId: "company_1",
    };

    expect(checkoutIdempotencyKey({ ...input, now })).toBe(
      checkoutIdempotencyKey({
        ...input,
        now: new Date("2026-08-11T12:30:59Z"),
      }),
    );
    expect(checkoutIdempotencyKey({ ...input, now })).not.toBe(
      checkoutIdempotencyKey({ ...input, now: nextMinute }),
    );
  });
});
