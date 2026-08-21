"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { LogOut, Menu } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Actor } from "@/domain/actor";
import { ADMIN_NAV_ITEMS, type AdminNavBadgeKey } from "./nav-items";

interface AdminSidebarProps {
  actor: Actor;
  displayName: string;
  roleLabel: string;
  counts: Partial<Record<AdminNavBadgeKey, number>>;
}

function NavLinks({
  actor,
  counts,
  locale,
  pathname,
  onNavigate,
}: {
  actor: Actor;
  counts: Partial<Record<AdminNavBadgeKey, number>>;
  locale: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  const t = useTranslations("admin.nav");
  const base = `/${locale}/dashboard/admin`;

  return (
    <TooltipProvider delayDuration={200}>
      <nav className="flex flex-col gap-1">
        {ADMIN_NAV_ITEMS.filter((item) => item.show(actor)).map((item) => {
          const Icon = item.icon;
          const href = item.href === null ? null : `${base}${item.href}`;
          const isActive = href !== null && pathname === href;
          const count = item.badge ? counts[item.badge] : undefined;

          if (href === null) {
            // A destination that needs its own spec before it can exist. The
            // reason is a real tooltip rather than a native title so it reads
            // the same as the rest of the console and follows the theme.
            return (
              <Tooltip key={item.key}>
                <TooltipTrigger asChild>
                  {/*
                    aria-disabled rather than disabled: a disabled button drops
                    out of the tab order, and this tooltip is the only place
                    that says why the item is inert. Announced as disabled,
                    still reachable by keyboard.
                  */}
                  <button
                    type="button"
                    aria-disabled="true"
                    onClick={(event) => event.preventDefault()}
                    className="flex cursor-not-allowed items-center gap-3 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {t(item.key)}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{t("comingSoon")}</TooltipContent>
              </Tooltip>
            );
          }

          return (
            <Link
              key={item.key}
              href={href}
              onClick={onNavigate}
              className={`flex items-center gap-3 border-l-2 px-3 py-2.5 text-xs font-bold uppercase tracking-[0.1em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                isActive
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">{t(item.key)}</span>
              {!!count && count > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px]"
                >
                  {count}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}

function IdentityBlock({
  displayName,
  roleLabel,
  onLogout,
  signOutLabel,
}: {
  displayName: string;
  roleLabel: string;
  onLogout: () => void;
  signOutLabel: string;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-border px-3 py-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold uppercase text-muted-foreground">
        {displayName.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {displayName}
        </p>
        <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {roleLabel}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onLogout}
        className="size-9 shrink-0 rounded-none p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={signOutLabel}
      >
        <LogOut className="size-4" />
      </Button>
    </div>
  );
}

export function AdminSidebar({
  actor,
  displayName,
  roleLabel,
  counts,
}: AdminSidebarProps) {
  const t = useTranslations("admin.nav");
  const tAuth = useTranslations("auth");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logoutAction();
    router.push(`/${locale}/login`);
  };

  return (
    <Fragment>
      {/* Desktop fixed sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-background lg:flex">
        <Link
          href={`/${locale}/dashboard/admin`}
          className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <span className="text-sm font-black uppercase tracking-[0.18em] text-accent">
            KCLUB
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {t("consoleLabel")}
          </span>
        </Link>
        <div className="flex-1 overflow-y-auto px-2 py-4">
          <NavLinks
            actor={actor}
            counts={counts}
            locale={locale}
            pathname={pathname}
          />
        </div>
        <IdentityBlock
          displayName={displayName}
          roleLabel={roleLabel}
          onLogout={() => void handleLogout()}
          signOutLabel={tAuth("signOut")}
        />
      </aside>

      {/* Mobile trigger */}
      <button
        type="button"
        className="fixed left-4 top-4 z-40 inline-flex size-11 items-center justify-center border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label={t("openNavigation")}
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="flex w-72 flex-col p-0">
          <SheetHeader className="border-b border-border p-4 text-left">
            <SheetTitle className="text-sm font-black uppercase tracking-[0.18em] text-accent">
              KCLUB — {t("consoleLabel")}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-2 py-4">
            <NavLinks
              actor={actor}
              counts={counts}
              locale={locale}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
          <IdentityBlock
            displayName={displayName}
            roleLabel={roleLabel}
            onLogout={() => void handleLogout()}
            signOutLabel={tAuth("signOut")}
          />
        </SheetContent>
      </Sheet>
    </Fragment>
  );
}
