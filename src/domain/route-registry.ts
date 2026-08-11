import type { Action, Subject } from "./authorization";

export interface RouteEntry {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  action: Action;
  subject: Subject;
  mutating: boolean;
  staffOnly: boolean;
  audited?: boolean;
}

const staticRoutes: RouteEntry[] = [
  {
    method: "GET",
    path: "/:locale",
    action: "read",
    subject: "marketing",
    mutating: false,
    staffOnly: false,
  },
  {
    method: "GET",
    path: "/:locale/login",
    action: "read",
    subject: "marketing",
    mutating: false,
    staffOnly: false,
  },
  {
    method: "GET",
    path: "/:locale/register",
    action: "read",
    subject: "marketing",
    mutating: false,
    staffOnly: false,
  },
  {
    method: "GET",
    path: "/:locale/legal",
    action: "read",
    subject: "marketing",
    mutating: false,
    staffOnly: false,
  },
  {
    method: "GET",
    path: "/:locale/legal/:document",
    action: "read",
    subject: "marketing",
    mutating: false,
    staffOnly: false,
  },
  {
    method: "GET",
    path: "/:locale/card/:token",
    action: "read",
    subject: "card_verification",
    mutating: false,
    staffOnly: false,
  },
  {
    method: "GET",
    path: "/:locale/directory",
    action: "read",
    subject: "catalogue",
    mutating: false,
    staffOnly: false,
  },
  {
    method: "GET",
    path: "/:locale/directory/:slug",
    action: "read",
    subject: "catalogue",
    mutating: false,
    staffOnly: false,
  },
  {
    method: "GET",
    path: "/:locale/dashboard/profile",
    action: "read",
    subject: "own_profile",
    mutating: false,
    staffOnly: false,
  },
  {
    method: "GET",
    path: "/:locale/dashboard/profile",
    action: "read",
    subject: "own_card",
    mutating: false,
    staffOnly: false,
  },
  {
    method: "GET",
    path: "/:locale/dashboard/profile",
    action: "read",
    subject: "own_subscription",
    mutating: false,
    staffOnly: false,
  },
  {
    method: "GET",
    path: "/:locale/dashboard/referrals",
    action: "read",
    subject: "own_referral",
    mutating: false,
    staffOnly: false,
  },
  {
    method: "GET",
    path: "/:locale/dashboard/checkout/success",
    action: "read",
    subject: "own_subscription",
    mutating: false,
    staffOnly: false,
  },
  {
    method: "GET",
    path: "/:locale/dashboard/checkout/canceled",
    action: "read",
    subject: "own_subscription",
    mutating: false,
    staffOnly: false,
  },
  {
    method: "GET",
    path: "/:locale/dashboard/company/new",
    action: "create",
    subject: "own_company",
    mutating: false,
    staffOnly: false,
  },
  {
    method: "GET",
    path: "/:locale/dashboard/admin",
    action: "read",
    subject: "audit_log",
    mutating: false,
    staffOnly: true,
  },
  {
    method: "GET",
    path: "/:locale/dashboard/admin/support",
    action: "read",
    subject: "company",
    mutating: false,
    staffOnly: true,
  },
  {
    method: "GET",
    path: "/:locale/dashboard/admin/categories",
    action: "read",
    subject: "company",
    mutating: false,
    staffOnly: true,
  },
  {
    method: "GET",
    path: "/:locale/dashboard/admin/companies",
    action: "read",
    subject: "company",
    mutating: false,
    staffOnly: true,
  },
  {
    method: "GET",
    path: "/:locale/dashboard/admin/members",
    action: "block",
    subject: "member",
    mutating: false,
    staffOnly: true,
  },
  {
    method: "GET",
    path: "/:locale/dashboard/admin/referrals",
    action: "approve",
    subject: "referral",
    mutating: false,
    staffOnly: true,
  },
  {
    method: "GET",
    path: "/:locale/dashboard/admin/audit",
    action: "read",
    subject: "audit_log",
    mutating: false,
    staffOnly: true,
  },
  {
    method: "GET",
    path: "/:locale/dashboard/admin/flags",
    action: "manage_flags",
    subject: "feature_flag",
    mutating: false,
    staffOnly: true,
  },
  {
    method: "POST",
    path: "action:createReferralAction",
    action: "send_referral",
    subject: "referral",
    mutating: true,
    staffOnly: false,
  },
  {
    method: "POST",
    path: "action:moderateReferralAction:approve",
    action: "approve",
    subject: "referral",
    mutating: true,
    staffOnly: true,
    audited: true,
  },
  {
    method: "POST",
    path: "action:moderateReferralAction:reject",
    action: "reject",
    subject: "referral",
    mutating: true,
    staffOnly: true,
    audited: true,
  },
  {
    method: "POST",
    path: "action:blockMemberAction",
    action: "block",
    subject: "member",
    mutating: true,
    staffOnly: true,
    audited: true,
  },
  {
    method: "POST",
    path: "action:blockMemberAction",
    action: "unblock",
    subject: "member",
    mutating: true,
    staffOnly: true,
    audited: true,
  },
  {
    method: "POST",
    path: "action:revokeCardAction",
    action: "revoke",
    subject: "card",
    mutating: true,
    staffOnly: true,
    audited: true,
  },
  {
    method: "POST",
    path: "action:reissueCardAction",
    action: "reissue",
    subject: "card",
    mutating: true,
    staffOnly: true,
    audited: true,
  },
  {
    method: "POST",
    path: "action:respondToReferralAction",
    action: "update",
    subject: "own_referral",
    mutating: true,
    staffOnly: false,
  },
  {
    method: "GET",
    path: "/api/export/member",
    action: "read",
    subject: "own_profile",
    mutating: false,
    staffOnly: false,
  },
  {
    method: "POST",
    path: "/api/webhooks/stripe",
    action: "create",
    subject: "subscription",
    mutating: true,
    staffOnly: false,
  },
  {
    method: "GET",
    path: "/api/cron/outbox-drain",
    action: "update",
    subject: "subscription",
    mutating: true,
    staffOnly: false,
  },
  {
    method: "GET",
    path: "/api/cron/referrals",
    action: "delete",
    subject: "referral",
    mutating: true,
    staffOnly: false,
  },
  {
    method: "GET",
    path: "/health/live",
    action: "read",
    subject: "marketing",
    mutating: false,
    staffOnly: false,
  },
  {
    method: "GET",
    path: "/health/ready",
    action: "read",
    subject: "marketing",
    mutating: false,
    staffOnly: false,
  },
  {
    method: "GET",
    path: "/.well-known/security.txt",
    action: "read",
    subject: "marketing",
    mutating: false,
    staffOnly: false,
  },
];

const routes: RouteEntry[] = [];

export function registerRoute(entry: RouteEntry): void {
  routes.push(entry);
}

export function getRegisteredRoutes(): readonly RouteEntry[] {
  return [...staticRoutes, ...routes];
}

export function getMutatingStaffRoutes(): readonly RouteEntry[] {
  return getRegisteredRoutes().filter((r) => r.mutating && r.staffOnly);
}

export function clearRegistry(): void {
  routes.length = 0;
}
