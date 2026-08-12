import { describe, it, expect } from "vitest";
import {
  isStaff,
  isAuthenticated,
  staffAtLeast,
  actorId,
  buildActor,
  isStaffRole,
  normalizeRole,
} from "./actor";
import type { Actor } from "./actor";

const guest: Actor = { type: "guest" };
const member: Actor = { type: "member", id: "m1", role: "member" };
const vip: Actor = { type: "member", id: "m2", role: "member_vip" };
const support: Actor = { type: "staff", id: "s1", role: "staff_support" };
const moderator: Actor = { type: "staff", id: "s2", role: "staff_moderator" };
const admin: Actor = { type: "staff", id: "s3", role: "staff_admin" };
const owner: Actor = { type: "staff", id: "s4", role: "staff_owner" };
const system: Actor = { type: "system" };

describe("isStaff", () => {
  it("returns true for staff actors", () => {
    expect(isStaff(support)).toBe(true);
    expect(isStaff(owner)).toBe(true);
  });

  it("returns false for non-staff actors", () => {
    expect(isStaff(guest)).toBe(false);
    expect(isStaff(member)).toBe(false);
    expect(isStaff(system)).toBe(false);
  });
});

describe("isAuthenticated", () => {
  it("returns false for guest", () => {
    expect(isAuthenticated(guest)).toBe(false);
  });

  it("returns true for everyone else", () => {
    expect(isAuthenticated(member)).toBe(true);
    expect(isAuthenticated(support)).toBe(true);
    expect(isAuthenticated(system)).toBe(true);
  });
});

describe("staffAtLeast", () => {
  it("respects the role hierarchy", () => {
    expect(staffAtLeast(support, "staff_support")).toBe(true);
    expect(staffAtLeast(support, "staff_moderator")).toBe(false);
    expect(staffAtLeast(moderator, "staff_support")).toBe(true);
    expect(staffAtLeast(moderator, "staff_moderator")).toBe(true);
    expect(staffAtLeast(admin, "staff_moderator")).toBe(true);
    expect(staffAtLeast(owner, "staff_admin")).toBe(true);
  });

  it("returns false for non-staff", () => {
    expect(staffAtLeast(member, "staff_support")).toBe(false);
    expect(staffAtLeast(guest, "staff_support")).toBe(false);
  });
});

describe("actorId", () => {
  it("returns id for identified actors", () => {
    expect(actorId(member)).toBe("m1");
    expect(actorId(support)).toBe("s1");
    expect(actorId(vip)).toBe("m2");
  });

  it("returns null for guest and system", () => {
    expect(actorId(guest)).toBeNull();
    expect(actorId(system)).toBeNull();
  });
});

describe("persisted role compatibility", () => {
  it("normalizes legacy database roles before building an actor", () => {
    expect(buildActor({ id: "m-legacy", role: "user" })).toEqual({
      type: "member",
      id: "m-legacy",
      role: "member",
    });

    expect(buildActor({ id: "s-legacy", role: "admin" })).toEqual({
      type: "staff",
      id: "s-legacy",
      role: "staff_owner",
    });
  });

  it("builds the domain actors persisted by the current member_role enum", () => {
    expect(buildActor({ id: "m-vip", role: "member_vip" })).toEqual({
      type: "member",
      id: "m-vip",
      role: "member_vip",
    });

    expect(buildActor({ id: "p-1", role: "partner_owner" })).toEqual({
      type: "partner_owner",
      id: "p-1",
      companyIds: [],
    });

    expect(buildActor({ id: "s-1", role: "staff_moderator" })).toEqual({
      type: "staff",
      id: "s-1",
      role: "staff_moderator",
    });
  });

  it("uses the same compatibility mapping for staff session checks", () => {
    expect(isStaffRole(normalizeRole("admin"))).toBe(true);
    expect(isStaffRole(normalizeRole("user"))).toBe(false);
  });
});
