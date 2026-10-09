import { describe, expect, it } from "vitest";

import { cardFace } from "./card-face";

describe("FR-021: the card a member is shown", () => {
  it("is the member card for a free tier without a live company", () => {
    expect(cardFace({ tier: "free", hasLiveCompany: false })).toBe("member");
  });

  it("is the VIP card for a VIP without a live company", () => {
    expect(cardFace({ tier: "vip", hasLiveCompany: false })).toBe("vip");
  });

  it("is the business-partner card for anyone with a live company, VIP included", () => {
    expect(cardFace({ tier: "free", hasLiveCompany: true })).toBe("business");
    expect(cardFace({ tier: "vip", hasLiveCompany: true })).toBe("business");
  });
});
