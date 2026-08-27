import { describe, expect, it } from "vitest";

import { memberPlansOf } from "./billing-access";

/**
 * FR-083: staff must be able to see what a member holds. The plan column is
 * that, and it is derived from the same access rule the entitlement projection
 * uses - not from `status === "active"`.
 *
 * That distinction is the whole point of these cases. A member in the FR-056
 * dunning window has a `past_due` subscription: Stripe is retrying, the member
 * has not lost anything, and the card is still VIP. Reading the plan any other
 * way would show staff `Free` for someone who has paid, which is money and
 * access disagreeing on a screen.
 */

const VIP = { companyId: null, status: "active" };
const LISTING = { companyId: "company-1", status: "active" };

describe("FR-083: memberPlansOf reads the access rule, not just 'active'", () => {
  it("reports free when there are no subscriptions at all", () => {
    expect(memberPlansOf([])).toEqual(["free"]);
  });

  it("reports VIP for a membership subscription", () => {
    expect(memberPlansOf([VIP])).toEqual(["vip"]);
  });

  it("reports business for a company listing", () => {
    expect(memberPlansOf([LISTING])).toEqual(["business"]);
  });

  it("reports both when a member holds both, rather than picking a winner", () => {
    expect(memberPlansOf([VIP, LISTING])).toEqual(["vip", "business"]);
  });

  it("FR-056: keeps VIP through past_due, because access survives dunning", () => {
    expect(memberPlansOf([{ companyId: null, status: "past_due" }])).toEqual([
      "vip",
    ]);
  });

  it.each([
    "canceled",
    "unpaid",
    "incomplete",
    "incomplete_expired",
    "deleted",
  ])("reports free for a %s subscription", (status) => {
    expect(memberPlansOf([{ companyId: null, status }])).toEqual(["free"]);
  });

  it("never reports free alongside a paid plan", () => {
    const plans = memberPlansOf([VIP, { companyId: null, status: "canceled" }]);

    expect(plans).toContain("vip");
    expect(plans).not.toContain("free");
  });

  it("ignores a lapsed listing while an active one is held", () => {
    expect(
      memberPlansOf([
        { companyId: "company-1", status: "canceled" },
        { companyId: "company-2", status: "active" },
      ]),
    ).toEqual(["business"]);
  });
});
