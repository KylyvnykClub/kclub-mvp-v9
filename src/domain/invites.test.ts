import { describe, expect, it } from "vitest";

import {
  inviteGrantsWaiver,
  inviterStanding,
  type InviterFacts,
} from "./invites";

const CLUB_MEMBER: InviterFacts = {
  inClub: true,
  ownsPaidListing: false,
  subscriptions: [{ plan: "membership", status: "active" }],
};

describe("FR-124: the invite matrix", () => {
  it.each([
    ["partner", "partner", true],
    ["partner", "member", true],
    ["vip", "partner", true],
    ["vip", "member", true],
    ["member", "partner", true],
    ["member", "member", false],
  ] as const)("a %s inviter's %s link waives: %s", (standing, kind, waived) => {
    expect(inviteGrantsWaiver(standing, kind)).toBe(waived);
  });
});

describe("FR-123: the inviter's standing when the newcomer registers", () => {
  it("is nothing for an inviter outside the club, whatever they hold", () => {
    expect(
      inviterStanding({
        inClub: false,
        ownsPaidListing: true,
        subscriptions: [{ plan: "vip", status: "active" }],
      }),
    ).toBeNull();
  });

  it("is a club member with dues and no VIP or listing", () => {
    expect(inviterStanding(CLUB_MEMBER)).toBe("member");
  });

  it("is VIP with an active VIP subscription", () => {
    expect(
      inviterStanding({
        ...CLUB_MEMBER,
        subscriptions: [{ plan: "vip", status: "active" }],
      }),
    ).toBe("vip");
  });

  it("keeps VIP through the dunning window (FR-056)", () => {
    expect(
      inviterStanding({
        ...CLUB_MEMBER,
        subscriptions: [{ plan: "vip", status: "past_due" }],
      }),
    ).toBe("vip");
  });

  it.each(["canceled", "unpaid", "incomplete", "deleted"])(
    "is a club member once the VIP subscription is %s",
    (status) => {
      expect(
        inviterStanding({
          ...CLUB_MEMBER,
          subscriptions: [{ plan: "vip", status }],
        }),
      ).toBe("member");
    },
  );

  it("is a business partner with a paid listing, VIP or not", () => {
    expect(inviterStanding({ ...CLUB_MEMBER, ownsPaidListing: true })).toBe(
      "partner",
    );
    expect(
      inviterStanding({
        inClub: true,
        ownsPaidListing: true,
        subscriptions: [{ plan: "vip", status: "active" }],
      }),
    ).toBe("partner");
  });
});
