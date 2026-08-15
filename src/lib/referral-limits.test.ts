import { describe, expect, it } from "vitest";

import {
  REFERRAL_DAILY_LIMIT,
  REFERRAL_PER_RECIPIENT_DAILY_LIMIT,
  REFERRAL_WINDOW_MS,
  checkReferralLimits,
  referralWindowStart,
} from "./referral-limits";

/**
 * FR-073: a sender is limited to 10 referrals per rolling 24 hours, and to 3
 * per rolling 24 hours to any single recipient company.
 *
 * The numbers are the requirement, so they are asserted as numbers as well as
 * behaviour - a limit that quietly drifts to 11 still passes a test written
 * only in terms of the constant.
 */

const ACME = "company-acme";
const OTHER = "company-other";

function sentTo(companyId: string, count: number) {
  return Array.from({ length: count }, () => ({
    recipientCompanyId: companyId,
  }));
}

describe("FR-073: referral sending limits", () => {
  it("sets the limits the requirement names", () => {
    expect(REFERRAL_DAILY_LIMIT).toBe(10);
    expect(REFERRAL_PER_RECIPIENT_DAILY_LIMIT).toBe(3);
    expect(REFERRAL_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("allows a first referral", () => {
    expect(checkReferralLimits([], ACME)).toEqual({ exceeded: false });
  });

  it("allows the tenth referral of the day and refuses the eleventh", () => {
    const nine = sentTo(OTHER, 9);
    expect(checkReferralLimits(nine, ACME)).toEqual({ exceeded: false });

    const ten = sentTo(OTHER, 10);
    expect(checkReferralLimits(ten, ACME)).toEqual({
      exceeded: true,
      limit: "daily",
    });
  });

  it("allows the third referral to one company and refuses the fourth", () => {
    expect(checkReferralLimits(sentTo(ACME, 2), ACME)).toEqual({
      exceeded: false,
    });

    expect(checkReferralLimits(sentTo(ACME, 3), ACME)).toEqual({
      exceeded: true,
      limit: "per_recipient",
    });
  });

  it("counts the per-recipient limit per company, not across all of them", () => {
    const spread = [...sentTo(ACME, 3), ...sentTo(OTHER, 2)];

    // Three already went to ACME, so ACME is closed but OTHER is not.
    expect(checkReferralLimits(spread, ACME)).toEqual({
      exceeded: true,
      limit: "per_recipient",
    });
    expect(checkReferralLimits(spread, OTHER)).toEqual({ exceeded: false });
  });

  it("reports the daily limit first when both are breached", () => {
    const many = [...sentTo(ACME, 5), ...sentTo(OTHER, 5)];

    expect(checkReferralLimits(many, ACME)).toEqual({
      exceeded: true,
      limit: "daily",
    });
  });

  it("cannot be evaded by spreading referrals across companies", () => {
    const spread = Array.from({ length: 10 }, (_, index) => ({
      recipientCompanyId: `company-${index}`,
    }));

    expect(checkReferralLimits(spread, "company-fresh")).toEqual({
      exceeded: true,
      limit: "daily",
    });
  });

  it("measures the window backwards from now, to the millisecond", () => {
    const now = new Date("2026-08-15T12:00:00.000Z");

    expect(referralWindowStart(now).toISOString()).toBe(
      "2026-08-14T12:00:00.000Z",
    );
  });
});
