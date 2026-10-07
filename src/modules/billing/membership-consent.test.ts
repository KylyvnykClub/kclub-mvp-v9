import { describe, expect, it } from "vitest";

import {
  membershipConsentText,
  membershipConsentTicked,
  postedMembershipWording,
} from "./membership-consent";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("ADR 0044 §2 for members: the payment authority before Stripe", () => {
  it("is ticked only when the box posts 'on'", () => {
    expect(membershipConsentTicked(form({ consentPayment: "on" }))).toBe(true);
    expect(membershipConsentTicked(form({ consentPayment: "" }))).toBe(false);
    expect(membershipConsentTicked(undefined)).toBe(false);
  });

  it("accepts only wordings the server knows", () => {
    expect(
      postedMembershipWording(form({ consentWording: "vip_switch" })),
    ).toBe("vip_switch");
    expect(postedMembershipWording(form({ consentWording: "anything" }))).toBe(
      null,
    );
  });

  it("records the dues screen's words with both prices", async () => {
    const text = await membershipConsentText("en", "member_dues");
    expect(text).toContain("$4.99 a month for membership");
    expect(text).toContain("$19.99 a month for VIP");
    expect(text).toContain("until I cancel");
  });

  it("records a switch as a switch, naming the difference charged now", async () => {
    const text = await membershipConsentText("uk", "vip_switch");
    expect(text).toContain("перевести мою підписку на VIP");
    expect(text).toContain("різниця");
  });

  it("gives a new VIP subscription its own words", async () => {
    const [created, switched] = await Promise.all([
      membershipConsentText("ru", "vip_new"),
      membershipConsentText("ru", "vip_switch"),
    ]);
    expect(created).not.toBe(switched);
    expect(created).toContain("до отмены");
  });
});
