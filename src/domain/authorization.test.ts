import { describe, it, expect } from "vitest";
import { can, assertCan } from "./authorization";
import { Forbidden } from "./errors";
import type { Actor } from "./actor";

const guest: Actor = { type: "guest" };
const member: Actor = { type: "member", id: "m1", role: "member" };
const vip: Actor = { type: "member", id: "m2", role: "member_vip" };
const support: Actor = { type: "staff", id: "s1", role: "staff_support" };
const moderator: Actor = { type: "staff", id: "s2", role: "staff_moderator" };
const admin: Actor = { type: "staff", id: "s3", role: "staff_admin" };
const staffOwner: Actor = { type: "staff", id: "s4", role: "staff_owner" };
const system: Actor = { type: "system" };

describe("can", () => {
  it("guest can read marketing", () => {
    expect(can(guest, "read", "marketing")).toBe(true);
  });

  it("FR-030: guest cannot read catalogue", () => {
    expect(can(guest, "read", "catalogue")).toBe(false);
  });

  it("FR-030: member can read catalogue", () => {
    expect(can(member, "read", "catalogue")).toBe(true);
  });

  it("FR-070: member cannot send referrals", () => {
    expect(can(member, "send_referral", "referral")).toBe(false);
  });

  it("FR-070: vip can send referrals", () => {
    expect(can(vip, "send_referral", "referral")).toBe(true);
  });

  it("member can read own profile and card", () => {
    expect(can(member, "read", "own_profile")).toBe(true);
    expect(can(member, "update", "own_profile")).toBe(true);
    expect(can(member, "delete", "own_profile")).toBe(true);
    expect(can(member, "read", "own_card")).toBe(true);
  });

  it("staff_support can read members but not block", () => {
    expect(can(support, "read", "member")).toBe(true);
    expect(can(support, "block", "member")).toBe(false);
    expect(can(support, "read", "finance_dashboard")).toBe(false);
  });

  it("staff_moderator can approve companies", () => {
    expect(can(moderator, "approve", "company")).toBe(true);
    expect(can(moderator, "reject", "company")).toBe(true);
    expect(can(moderator, "block", "referral")).toBe(true);
    expect(can(moderator, "manage_reference_data", "reference_data")).toBe(
      true,
    );
  });

  it("staff_admin can block members and publish companies", () => {
    expect(can(admin, "block", "member")).toBe(true);
    expect(can(admin, "publish", "company")).toBe(true);
    expect(can(admin, "revoke", "card")).toBe(true);
    expect(can(admin, "read", "finance_dashboard")).toBe(true);
    expect(can(admin, "read", "audit_log")).toBe(false);
  });

  it("staff_admin cannot manage staff", () => {
    expect(can(admin, "manage_staff", "staff_user")).toBe(false);
  });

  it("staff_owner can manage staff, flags, and plan prices", () => {
    expect(can(staffOwner, "manage_staff", "staff_user")).toBe(true);
    expect(can(staffOwner, "manage_flags", "feature_flag")).toBe(true);
    expect(can(staffOwner, "manage_prices", "plan_price")).toBe(true);
    expect(can(staffOwner, "read", "audit_log")).toBe(true);
    expect(can(staffOwner, "export_data", "member")).toBe(true);
  });

  it("system can create and update subscriptions", () => {
    expect(can(system, "create", "subscription")).toBe(true);
    expect(can(system, "update", "subscription")).toBe(true);
  });

  it("staff hierarchy is respected — admin inherits moderator permissions", () => {
    expect(can(admin, "approve", "company")).toBe(true);
    expect(can(admin, "read", "member")).toBe(true);
  });
});

describe("assertCan", () => {
  it("does not throw when allowed", () => {
    expect(() => assertCan(member, "read", "catalogue")).not.toThrow();
  });

  it("throws Forbidden when not allowed", () => {
    expect(() => assertCan(guest, "read", "catalogue")).toThrow(Forbidden);
  });

  it("includes actor type in the error message", () => {
    try {
      assertCan(guest, "read", "catalogue");
    } catch (e) {
      expect(e).toBeInstanceOf(Forbidden);
      expect((e as Forbidden).message).toContain("guest");
    }
  });
});
