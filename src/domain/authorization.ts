import type { Actor } from "./actor";
import { isAuthenticated, isStaff, staffAtLeast } from "./actor";
import { Forbidden } from "./errors";

export type Action =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "publish"
  | "unpublish"
  | "approve"
  | "reject"
  | "block"
  | "unblock"
  | "revoke"
  | "reissue"
  | "send_referral"
  | "export_data"
  | "manage_reference_data"
  | "manage_staff"
  | "manage_flags"
  | "manage_prices";

export type Subject =
  | "marketing"
  | "catalogue"
  | "own_profile"
  | "own_company"
  | "own_subscription"
  | "own_card"
  | "own_referral"
  | "card_verification"
  | "referral"
  | "member"
  | "company"
  | "subscription"
  | "card"
  | "moderation"
  | "finance_dashboard"
  | "reference_data"
  | "audit_log"
  | "staff_user"
  | "feature_flag"
  | "plan_price";

type Rule = (actor: Actor) => boolean;

const rules: Array<{ action: Action; subject: Subject; check: Rule }> = [
  // Guest: public content only
  { action: "read", subject: "marketing", check: () => true },
  { action: "read", subject: "card_verification", check: () => true },

  // Authenticated: catalogue
  { action: "read", subject: "catalogue", check: (a) => isAuthenticated(a) },

  // Members: own resources
  { action: "read", subject: "own_profile", check: (a) => a.type === "member" },
  {
    action: "update",
    subject: "own_profile",
    check: (a) => a.type === "member",
  },
  {
    action: "delete",
    subject: "own_profile",
    check: (a) => a.type === "member",
  },
  { action: "read", subject: "own_card", check: (a) => a.type === "member" },
  {
    action: "read",
    subject: "own_subscription",
    check: (a) => a.type === "member",
  },
  {
    action: "read",
    subject: "own_referral",
    check: (a) => a.type === "member" || a.type === "partner_owner",
  },
  {
    action: "update",
    subject: "own_referral",
    check: (a) => a.type === "member" || a.type === "partner_owner",
  },

  // Partner owners: own company
  {
    action: "create",
    subject: "own_company",
    check: (a) => a.type === "member" || a.type === "partner_owner",
  },
  {
    action: "read",
    subject: "own_company",
    check: (a) =>
      a.type === "member" || a.type === "partner_owner" || a.type === "staff",
  },
  {
    action: "update",
    subject: "own_company",
    check: (a) => a.type === "partner_owner",
  },

  // VIP: referrals
  {
    action: "send_referral",
    subject: "referral",
    check: (a) => a.type === "member" && a.role === "member_vip",
  },

  // Staff support: read-only
  {
    action: "read",
    subject: "member",
    check: (a) => staffAtLeast(a, "staff_support"),
  },
  {
    action: "read",
    subject: "company",
    check: (a) => staffAtLeast(a, "staff_support"),
  },
  {
    action: "read",
    subject: "subscription",
    check: (a) => staffAtLeast(a, "staff_support"),
  },
  {
    action: "read",
    subject: "card",
    check: (a) => staffAtLeast(a, "staff_support"),
  },
  {
    action: "read",
    subject: "moderation",
    check: (a) => staffAtLeast(a, "staff_support"),
  },
  {
    action: "read",
    subject: "audit_log",
    check: (a) => isStaff(a) && a.role === "staff_owner",
  },
  {
    action: "export_data",
    subject: "member",
    check: (a) => isStaff(a) && a.role === "staff_owner",
  },
  {
    action: "read",
    subject: "finance_dashboard",
    check: (a) => staffAtLeast(a, "staff_admin"),
  },

  // Staff moderator: approve/reject
  {
    action: "approve",
    subject: "company",
    check: (a) => staffAtLeast(a, "staff_moderator"),
  },
  {
    action: "reject",
    subject: "company",
    check: (a) => staffAtLeast(a, "staff_moderator"),
  },
  {
    action: "approve",
    subject: "referral",
    check: (a) => staffAtLeast(a, "staff_moderator"),
  },
  {
    action: "reject",
    subject: "referral",
    check: (a) => staffAtLeast(a, "staff_moderator"),
  },
  {
    action: "block",
    subject: "referral",
    check: (a) => staffAtLeast(a, "staff_moderator"),
  },
  {
    action: "manage_reference_data",
    subject: "reference_data",
    check: (a) => staffAtLeast(a, "staff_moderator"),
  },

  // Staff admin: block, revoke, publish
  {
    action: "block",
    subject: "member",
    check: (a) => staffAtLeast(a, "staff_admin"),
  },
  {
    action: "unblock",
    subject: "member",
    check: (a) => staffAtLeast(a, "staff_admin"),
  },
  {
    action: "revoke",
    subject: "card",
    check: (a) => staffAtLeast(a, "staff_admin"),
  },
  {
    action: "reissue",
    subject: "card",
    check: (a) => staffAtLeast(a, "staff_admin"),
  },
  {
    action: "publish",
    subject: "company",
    check: (a) => staffAtLeast(a, "staff_admin"),
  },
  {
    action: "unpublish",
    subject: "company",
    check: (a) => staffAtLeast(a, "staff_admin"),
  },

  // Staff owner: manage staff, feature flags
  {
    action: "manage_staff",
    subject: "staff_user",
    check: (a) => isStaff(a) && a.role === "staff_owner",
  },
  {
    action: "manage_flags",
    subject: "feature_flag",
    check: (a) => isStaff(a) && a.role === "staff_owner",
  },
  {
    action: "manage_prices",
    subject: "plan_price",
    check: (a) => isStaff(a) && a.role === "staff_owner",
  },

  // System: everything it needs
  {
    action: "create",
    subject: "subscription",
    check: (a) => a.type === "system",
  },
  {
    action: "update",
    subject: "subscription",
    check: (a) => a.type === "system",
  },
  {
    action: "publish",
    subject: "company",
    check: (a) => a.type === "system",
  },
  {
    action: "unpublish",
    subject: "company",
    check: (a) => a.type === "system",
  },
];

export function can(actor: Actor, action: Action, subject: Subject): boolean {
  return rules.some(
    (r) => r.action === action && r.subject === subject && r.check(actor),
  );
}

export function assertCan(
  actor: Actor,
  action: Action,
  subject: Subject,
): void {
  if (!can(actor, action, subject)) {
    throw new Forbidden(`${actor.type} cannot ${action} ${subject}`);
  }
}
