import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Building2,
  Handshake,
  LifeBuoy,
  FolderKanban,
  ShieldCheck,
  ScrollText,
  KeyRound,
  FileText,
} from "lucide-react";
import type { Actor } from "@/domain/actor";
import { can } from "@/domain/authorization";

export type AdminNavBadgeKey = "pendingCompanies" | "pendingReferrals";

export interface AdminNavItem {
  key: string;
  /** Path relative to /dashboard/admin, "" for the root overview page. */
  href: string | null;
  icon: LucideIcon;
  show: (actor: Actor) => boolean;
  badge?: AdminNavBadgeKey;
  disabled?: boolean;
}

/**
 * `show` reuses the exact `can()` rules already enforced server-side by each
 * page - this list only controls visibility, never authorization.
 */
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    key: "overview",
    href: "",
    icon: LayoutDashboard,
    show: (a) => can(a, "read", "finance_dashboard"),
  },
  {
    key: "users",
    href: "/members",
    icon: Users,
    show: (a) => can(a, "read", "member"),
  },
  {
    key: "companies",
    href: "/companies",
    icon: Building2,
    show: (a) => can(a, "read", "company"),
    badge: "pendingCompanies",
  },
  {
    key: "introductions",
    href: "/referrals",
    icon: Handshake,
    show: (a) => can(a, "approve", "referral") || can(a, "reject", "referral"),
    badge: "pendingReferrals",
  },
  {
    key: "support",
    href: "/support",
    icon: LifeBuoy,
    show: (a) => can(a, "read", "moderation"),
  },
  {
    key: "categories",
    href: "/categories",
    icon: FolderKanban,
    show: (a) => can(a, "read", "company"),
  },
  {
    key: "staff",
    href: "/staff",
    icon: ShieldCheck,
    show: (a) => can(a, "manage_staff", "staff_user"),
  },
  {
    key: "flags",
    href: "/flags",
    icon: KeyRound,
    show: (a) => can(a, "manage_flags", "feature_flag"),
  },
  {
    key: "audit",
    href: "/audit",
    icon: ScrollText,
    show: (a) => can(a, "read", "audit_log"),
  },
  {
    key: "contentAccess",
    href: null,
    icon: FileText,
    show: (a) => can(a, "manage_staff", "staff_user"),
    disabled: true,
  },
  {
    key: "rolesPermissions",
    href: null,
    icon: ShieldCheck,
    show: (a) => can(a, "manage_staff", "staff_user"),
    disabled: true,
  },
];
