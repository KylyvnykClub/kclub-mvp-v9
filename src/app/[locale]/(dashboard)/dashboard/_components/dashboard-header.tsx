"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { logoutAction } from "@/actions/auth";
import { LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Actor } from "@/domain/actor";
import { can } from "@/domain/authorization";

export function DashboardHeader({ actor }: { actor: Actor }) {
  const tDashboard = useTranslations("dashboard");
  const tAuth = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await logoutAction();
    router.push(`/${locale}/login`);
  };

  const navItems = [
    {
      href: `/${locale}/dashboard/profile`,
      label: tDashboard("profile"),
      show: true,
    },
    {
      href: `/${locale}/directory`,
      label: tDashboard("navPartners"),
      show: true,
    },
    {
      href: `/${locale}/dashboard/company/new`,
      label: tDashboard("navRegisterCompany"),
      show: true,
    },
    {
      href: `/${locale}/dashboard/admin/support`,
      label: tDashboard("navAdminSupport"),
      show: can(actor, "read", "company"),
    },
    {
      href: `/${locale}/dashboard/admin/categories`,
      label: tDashboard("navAdminCategories"),
      show: can(actor, "read", "company"),
    },
    {
      href: `/${locale}/dashboard/admin/companies`,
      label: tDashboard("navAdminModeration"),
      show: can(actor, "read", "company"),
    },
    {
      href: `/${locale}/dashboard/admin/members`,
      label: tDashboard("navAdminMembers"),
      show: can(actor, "block", "member"),
    },
    {
      href: `/${locale}/dashboard/admin/staff`,
      label: tDashboard("navAdminStaff"),
      show: can(actor, "manage_staff", "staff_user"),
    },
    {
      href: `/${locale}/dashboard/admin/flags`,
      label: tDashboard("navAdminFlags"),
      show: can(actor, "manage_flags", "feature_flag"),
    },
    {
      href: `/${locale}/dashboard/admin/audit`,
      label: tDashboard("navAdminAudit"),
      show: can(actor, "read", "audit_log"),
    },
  ].filter((item) => item.show);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-xl">
      <div className="kclub-shell flex min-h-16 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-6">
          <Link
            href={`/${locale}/dashboard/profile`}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <span className="text-sm font-black uppercase tracking-[0.18em] text-accent">
              KCLUB
            </span>
            <span className="hidden h-4 w-px bg-border sm:block" />
            <span className="hidden text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground sm:block">
              {tDashboard("title")}
            </span>
          </Link>

          <nav className="hidden min-w-0 items-center gap-1 overflow-x-auto lg:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex min-h-11 shrink-0 items-center border-b border-transparent px-3 text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:border-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center border border-border text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="dashboard-mobile-navigation"
            aria-label={
              open
                ? tDashboard("closeNavigation")
                : tDashboard("openNavigation")
            }
          >
            {open ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleLogout()}
            className="h-11 rounded-none px-3 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4 sm:mr-2" />
            <span className="sr-only text-xs font-bold uppercase tracking-[0.12em] sm:not-sr-only sm:inline-block">
              {tAuth("signOut")}
            </span>
          </Button>
        </div>
      </div>

      {open && (
        <nav
          id="dashboard-mobile-navigation"
          className="border-t border-border bg-background lg:hidden"
          aria-label={tDashboard("title")}
        >
          <div className="kclub-shell grid py-3">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="border-b border-border py-3 text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
