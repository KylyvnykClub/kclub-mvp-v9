import { describe, expect, it } from "vitest";

import { membershipAccess, type MembershipSubscription } from "./membership";

const DUES: MembershipSubscription = { plan: "membership", status: "active" };
const VIP: MembershipSubscription = { plan: "vip", status: "active" };
const LISTING: MembershipSubscription = { plan: "listing", status: "active" };

describe("FR-103: a paying member reaches the club only while their dues are paid", () => {
  it("refuses a paying member with no subscription at all", () => {
    expect(membershipAccess({ duesKind: "paying" }, [])).toBe(
      "awaiting_payment",
    );
  });

  it("admits a paying member whose dues subscription is active", () => {
    expect(membershipAccess({ duesKind: "paying" }, [DUES])).toBe("active");
  });

  it("keeps a paying member in through the dunning window (FR-056)", () => {
    expect(
      membershipAccess({ duesKind: "paying" }, [
        { plan: "membership", status: "past_due" },
      ]),
    ).toBe("active");
  });

  it.each([
    "unpaid",
    "canceled",
    "incomplete",
    "incomplete_expired",
    "deleted",
  ])("refuses a paying member whose dues subscription is %s", (status) => {
    expect(
      membershipAccess({ duesKind: "paying" }, [
        { plan: "membership", status },
      ]),
    ).toBe("awaiting_payment");
  });

  it("does not let VIP or a listing pay the dues", () => {
    expect(membershipAccess({ duesKind: "paying" }, [VIP, LISTING])).toBe(
      "awaiting_payment",
    );
  });
});

describe("FR-108: access follows the subscription in both directions", () => {
  it("opens as soon as the projected subscription is active", () => {
    const member = { duesKind: "paying" } as const;

    expect(membershipAccess(member, [])).toBe("awaiting_payment");
    expect(membershipAccess(member, [DUES])).toBe("active");
  });

  it("closes again as soon as it is not", () => {
    const member = { duesKind: "paying" } as const;

    expect(
      membershipAccess(member, [{ plan: "membership", status: "canceled" }]),
    ).toBe("awaiting_payment");
  });

  it("reads the subscription rows and nothing else, so nothing but Stripe can open it", () => {
    // The rule takes only the member's dues kind and the projected rows. There
    // is no argument it could be handed by a checkout redirect (FR-104).
    expect(membershipAccess.length).toBe(2);
  });
});

describe("FR-105, FR-107: sponsored and legacy members are never asked to pay", () => {
  it("admits a sponsored member with no subscription", () => {
    expect(membershipAccess({ duesKind: "sponsored" }, [])).toBe("active");
  });

  it("admits a legacy member with no subscription", () => {
    expect(membershipAccess({ duesKind: "legacy_free" }, [])).toBe("active");
  });

  it("admits a legacy member whose old VIP subscription lapsed", () => {
    expect(
      membershipAccess({ duesKind: "legacy_free" }, [
        { plan: "vip", status: "canceled" },
      ]),
    ).toBe("active");
  });
});
