import { describe, expect, it } from "vitest";

import { joinLinkGrant } from "./join-link";

describe("FR-105: what a join link grants a new account", () => {
  it("a member link waives dues and issues a free card", () => {
    expect(joinLinkGrant("member", "member")).toEqual({
      sponsored: true,
      cardTier: "free",
    });
  });

  it("ADR 0048: a VIP link waives dues and issues a VIP card", () => {
    expect(joinLinkGrant("vip", "member")).toEqual({
      sponsored: true,
      cardTier: "vip",
    });
  });

  it("a partner link waives no dues: it waives a listing, elsewhere", () => {
    expect(joinLinkGrant("partner", "member")).toEqual({
      sponsored: false,
      cardTier: "free",
    });
  });

  it("no link, or a partner registration, grants nothing", () => {
    expect(joinLinkGrant(null, "member")).toEqual({
      sponsored: false,
      cardTier: "free",
    });
    expect(joinLinkGrant("vip", "partner")).toEqual({
      sponsored: false,
      cardTier: "free",
    });
  });
});
