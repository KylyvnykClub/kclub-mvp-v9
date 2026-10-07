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

const PAYING = { duesKind: "paying" };
const SPONSORED = { duesKind: "sponsored" };
const DUES = { plan: "membership", status: "active" };
const VIP = { plan: "vip", status: "active" };
const LISTING = { plan: "listing", status: "active" };

describe("FR-083: memberPlansOf reads the access rule, not just 'active'", () => {
  it("reports free for a member let in without dues and holding nothing", () => {
    expect(memberPlansOf(SPONSORED, [])).toEqual(["free"]);
  });

  it("reports VIP for a VIP subscription", () => {
    expect(memberPlansOf(SPONSORED, [VIP])).toEqual(["vip"]);
  });

  it("reports business for a company listing", () => {
    expect(memberPlansOf(SPONSORED, [LISTING])).toEqual(["business"]);
  });

  it("reports both when a member holds both, rather than picking a winner", () => {
    expect(memberPlansOf(SPONSORED, [VIP, LISTING])).toEqual([
      "vip",
      "business",
    ]);
  });

  it("FR-056: keeps VIP through past_due, because access survives dunning", () => {
    expect(
      memberPlansOf(SPONSORED, [{ plan: "vip", status: "past_due" }]),
    ).toEqual(["vip"]);
  });

  it.each([
    "canceled",
    "unpaid",
    "incomplete",
    "incomplete_expired",
    "deleted",
  ])("reports free for a %s subscription", (status) => {
    expect(memberPlansOf(SPONSORED, [{ plan: "vip", status }])).toEqual([
      "free",
    ]);
  });

  it("never reports free alongside a paid plan", () => {
    const plans = memberPlansOf(SPONSORED, [
      VIP,
      { plan: "vip", status: "canceled" },
    ]);

    expect(plans).toContain("vip");
    expect(plans).not.toContain("free");
  });

  it("ignores a lapsed listing while an active one is held", () => {
    expect(
      memberPlansOf(SPONSORED, [
        { plan: "listing", status: "canceled" },
        { plan: "listing", status: "active" },
      ]),
    ).toEqual(["business"]);
  });
});

describe("FR-083, FR-103: the plan column tells paid dues from a registration that never paid", () => {
  it("reports unpaid for a paying member with no subscription - not free", () => {
    expect(memberPlansOf(PAYING, [])).toEqual(["unpaid"]);
  });

  it("reports member once the dues subscription grants access", () => {
    expect(memberPlansOf(PAYING, [DUES])).toEqual(["member"]);
  });

  it("keeps member through past_due dues, like every other plan (FR-056)", () => {
    expect(
      memberPlansOf(PAYING, [{ plan: "membership", status: "past_due" }]),
    ).toEqual(["member"]);
  });

  it("reports unpaid again once the dues lapse", () => {
    expect(
      memberPlansOf(PAYING, [{ plan: "membership", status: "canceled" }]),
    ).toEqual(["unpaid"]);
  });

  it("reports VIP alone for a paying member on VIP - it includes the dues (ADR 0043)", () => {
    expect(memberPlansOf(PAYING, [VIP])).toEqual(["vip"]);
  });

  it("reports VIP, not member, while a switch leaves both rows briefly", () => {
    expect(memberPlansOf(PAYING, [DUES, VIP])).toEqual(["vip"]);
  });

  it("reports unpaid beside business for a paying member whose dues are not paid", () => {
    expect(memberPlansOf(PAYING, [LISTING])).toEqual(["unpaid", "business"]);
  });

  it.each(["sponsored", "legacy_free", "partner"])(
    "never reports unpaid for a %s member",
    (duesKind) => {
      expect(memberPlansOf({ duesKind }, [])).toEqual(["free"]);
    },
  );
});
