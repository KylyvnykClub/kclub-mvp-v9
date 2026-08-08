"use client";

import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { logoutAction } from "@/actions/auth";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Actor } from "@/domain/actor";
import { can } from "@/domain/authorization";

export function DashboardHeader({ actor }: { actor: Actor }) {
  const tDashboard = useTranslations("dashboard");
  const tAuth = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();

  const handleLogout = async () => {
    await logoutAction();
    router.push(`/${locale}/login`);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center justify-between">
        <div className="flex items-center gap-6 md:gap-10">
          <Link
            href={`/${locale}/dashboard/profile`}
            className="flex items-center space-x-2 px-4 sm:px-0"
          >
            <span className="font-serif text-accent font-bold inline-block">
              KCLUB
            </span>
          </Link>
          <nav className="flex gap-6">
            <Link
              href={`/${locale}/dashboard/profile`}
              className="text-sm font-medium transition-colors hover:text-accent text-foreground/80"
            >
              {tDashboard("profile")}
            </Link>
            <Link
              href={`/${locale}/partners`}
              className="text-sm font-medium transition-colors hover:text-accent text-foreground/80"
            >
              {tDashboard("navPartners")}
            </Link>
            <Link
              href={`/${locale}/dashboard/company/new`}
              className="text-sm font-medium transition-colors hover:text-accent text-foreground/80"
            >
              {tDashboard("navRegisterCompany")}
            </Link>
            {can(actor, "read", "company") && (
              <>
                <Link
                  href={`/${locale}/dashboard/admin/support`}
                  className="text-sm font-medium transition-colors hover:text-accent text-foreground/80"
                >
                  {tDashboard("navAdminSupport")}
                </Link>
                <Link
                  href={`/${locale}/dashboard/admin/categories`}
                  className="text-sm font-medium transition-colors hover:text-accent text-foreground/80"
                >
                  {tDashboard("navAdminCategories")}
                </Link>
                <Link
                  href={`/${locale}/dashboard/admin/companies`}
                  className="text-sm font-medium transition-colors hover:text-accent text-foreground/80"
                >
                  {tDashboard("navAdminModeration")}
                </Link>
              </>
            )}
            {can(actor, "block", "member") && (
              <Link
                href={`/${locale}/dashboard/admin/members`}
                className="text-sm font-medium transition-colors hover:text-accent text-foreground/80"
              >
                {tDashboard("navAdminMembers")}
              </Link>
            )}
            {can(actor, "manage_flags", "feature_flag") && (
              <Link
                href={`/${locale}/dashboard/admin/flags`}
                className="text-sm font-medium transition-colors hover:text-accent text-foreground/80"
              >
                {tDashboard("navAdminFlags")}
              </Link>
            )}
            {can(actor, "read", "audit_log") && (
              <Link
                href={`/${locale}/dashboard/admin/audit`}
                className="text-sm font-medium transition-colors hover:text-accent text-foreground/80"
              >
                {tDashboard("navAdminAudit")}
              </Link>
            )}
          </nav>
        </div>
        <div className="flex flex-1 items-center justify-end space-x-4 pr-4 sm:pr-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleLogout()}
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut className="sm:mr-2 h-4 w-4" />
            <span className="sr-only sm:not-sr-only sm:inline-block">
              {tAuth("signOut")}
            </span>
          </Button>
        </div>
      </div>
    </header>
  );
}
