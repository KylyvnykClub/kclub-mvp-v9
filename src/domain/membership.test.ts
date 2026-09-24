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

/**
 * FR-110: a business partner pays for a listing, never for membership dues.
 *
 * The client's words were "the business pays no $4.99, only the $19.99, and
 * then everything is open". Both halves are rules: the dues screen is not
 * theirs, and the listing is what opens the club - so an unpaid partner is
 * held outside it rather than let in free on the strength of an application
 * nobody has read yet.
 */
describe("FR-110: a partner's access follows the listing, not the dues", () => {
  it("lets a partner in once the listing subscription is active", () => {
    expect(membershipAccess({ duesKind: "partner" }, [LISTING])).toBe("active");
  });

  it("keeps a partner in through the dunning window, like every other member", () => {
    expect(
      membershipAccess({ duesKind: "partner" }, [
        { plan: "listing", status: "past_due" },
      ]),
    ).toBe("active");
  });

  it("holds a partner outside the club before the listing is paid for", () => {
    expect(membershipAccess({ duesKind: "partner" }, [])).toBe(
      "awaiting_payment",
    );
  });

  it.each([
    "unpaid",
    "canceled",
    "incomplete",
    "incomplete_expired",
    "deleted",
  ])("holds a partner outside the club when the listing is %s", (status) => {
    expect(
      membershipAccess({ duesKind: "partner" }, [{ plan: "listing", status }]),
    ).toBe("awaiting_payment");
  });

  it("never asks a partner for membership dues - a dues subscription is not what opens it", () => {
    // Nothing should ever create this row for a partner. If something did, it
    // must not be the thing that lets them in: the listing is.
    expect(membershipAccess({ duesKind: "partner" }, [DUES])).toBe(
      "awaiting_payment",
    );
  });

  it("does not let VIP stand in for the listing", () => {
    expect(membershipAccess({ duesKind: "partner" }, [VIP])).toBe(
      "awaiting_payment",
    );
  });

  it("does not let a listing pay a paying member's dues either", () => {
    // The two are not interchangeable in either direction: what a member owes
    // is decided by their dues kind, not by whichever subscription they hold.
    expect(membershipAccess({ duesKind: "paying" }, [LISTING])).toBe(
      "awaiting_payment",
    );
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
