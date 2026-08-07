import { describe, it, expect } from "vitest";
import { isStaff, isAuthenticated, staffAtLeast, actorId } from "./actor";
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
