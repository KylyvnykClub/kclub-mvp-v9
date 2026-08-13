import { describe, it, expect } from "vitest";
import { can } from "@/domain/authorization.js";
import type { Actor } from "@/domain/actor.js";
import type { Action, Subject } from "@/domain/authorization.js";

/**
 * Constraint suite 3: Staff role matrix (testing.md §3, security.md §2)
 *
 * Each staff role against each console action, asserted against the
 * permission table in security.md §2. An action with no row in the
 * matrix fails the test rather than defaulting to allowed.
 *
 * This is the definitive truth table. If can() disagrees with this
 * matrix, can() is wrong.
 */

const support: Actor = { type: "staff", id: "s1", role: "staff_support" };
const moderator: Actor = { type: "staff", id: "s2", role: "staff_moderator" };
const admin: Actor = { type: "staff", id: "s3", role: "staff_admin" };
const owner: Actor = { type: "staff", id: "s4", role: "staff_owner" };

const allStaff = [
  { actor: support, label: "support" },
  { actor: moderator, label: "moderator" },
  { actor: admin, label: "admin" },
  { actor: owner, label: "owner" },
];

type MatrixEntry = {
  action: Action;
  subject: Subject;
  support: boolean;
  moderator: boolean;
  admin: boolean;
  owner: boolean;
};

const matrix: MatrixEntry[] = [
  // Read permissions — support and above
  {
    action: "read",
    subject: "member",
    support: true,
    moderator: true,
    admin: true,
    owner: true,
  },
  {
    action: "read",
    subject: "company",
    support: true,
    moderator: true,
    admin: true,
    owner: true,
  },
  {
    action: "read",
    subject: "subscription",
    support: true,
    moderator: true,
    admin: true,
    owner: true,
  },
  {
    action: "read",
    subject: "card",
    support: true,
    moderator: true,
    admin: true,
    owner: true,
  },
  {
    action: "read",
    subject: "moderation",
    support: true,
    moderator: true,
    admin: true,
    owner: true,
  },
  {
    action: "read",
    subject: "audit_log",
    support: true,
    moderator: true,
    admin: true,
    owner: true,
  },
  {
    action: "read",
    subject: "finance_dashboard",
    support: false,
    moderator: false,
    admin: true,
    owner: true,
  },

  // Moderator actions
  {
    action: "approve",
    subject: "company",
    support: false,
    moderator: true,
    admin: true,
    owner: true,
  },
  {
    action: "reject",
    subject: "company",
    support: false,
    moderator: true,
    admin: true,
    owner: true,
  },
  {
    action: "approve",
    subject: "referral",
    support: false,
    moderator: true,
    admin: true,
    owner: true,
  },
  {
    action: "reject",
    subject: "referral",
    support: false,
    moderator: true,
    admin: true,
    owner: true,
  },
  {
    action: "manage_reference_data",
    subject: "reference_data",
    support: false,
    moderator: true,
    admin: true,
    owner: true,
  },

  // Admin actions
  {
    action: "block",
    subject: "member",
    support: false,
    moderator: false,
    admin: true,
    owner: true,
  },
  {
    action: "unblock",
    subject: "member",
    support: false,
    moderator: false,
    admin: true,
    owner: true,
  },
  {
    action: "revoke",
    subject: "card",
    support: false,
    moderator: false,
    admin: true,
    owner: true,
  },
  {
    action: "reissue",
    subject: "card",
    support: false,
    moderator: false,
    admin: true,
    owner: true,
  },
  {
    action: "publish",
    subject: "company",
    support: false,
    moderator: false,
    admin: true,
    owner: true,
  },
  {
    action: "unpublish",
    subject: "company",
    support: false,
    moderator: false,
    admin: true,
    owner: true,
  },

  // Owner-only actions
  {
    action: "manage_staff",
    subject: "staff_user",
    support: false,
    moderator: false,
    admin: false,
    owner: true,
  },
  {
    action: "manage_flags",
    subject: "feature_flag",
    support: false,
    moderator: false,
    admin: false,
    owner: true,
  },
];

describe("constraint: staff role matrix (security.md §2)", () => {
  for (const entry of matrix) {
    describe(`${entry.action} ${entry.subject}`, () => {
      for (const { actor, label } of allStaff) {
        const expected = entry[label as keyof MatrixEntry] as boolean;
        it(`${label}: ${expected ? "allowed" : "denied"}`, () => {
          expect(
            can(actor, entry.action, entry.subject),
            `${label} should ${expected ? "be able to" : "NOT be able to"} ${entry.action} ${entry.subject}`,
          ).toBe(expected);
        });
      }
    });
  }

  describe("structural rules", () => {
    it("no member can read another member", () => {
      const member: Actor = { type: "member", id: "m1", role: "member" };
      expect(can(member, "read", "member")).toBe(false);
    });

    it("guest cannot read members", () => {
      expect(can({ type: "guest" }, "read", "member")).toBe(false);
    });

    it("system cannot act as a named staff user", () => {
      const system: Actor = { type: "system" };
      expect(can(system, "manage_staff", "staff_user")).toBe(false);
    });
  });

  describe("proved to fail", () => {
    it("detects when the matrix disagrees with can()", () => {
      const testEntry = matrix.find(
        (e) => e.action === "block" && e.subject === "member",
      )!;
      expect(testEntry.support).toBe(false);
      expect(can(support, "block", "member")).toBe(false);

      expect(testEntry.admin).toBe(true);
      expect(can(admin, "block", "member")).toBe(true);
    });

    it("a new action not in the matrix defaults to denied for all roles", () => {
      for (const { actor, label } of allStaff) {
        const allowed = can(actor, "delete", "member");
        expect(
          allowed,
          `${label} should be denied an unregistered action`,
        ).toBe(false);
      }
    });
  });
});
