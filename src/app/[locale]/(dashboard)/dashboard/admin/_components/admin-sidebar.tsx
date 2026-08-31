"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { ChevronsUpDown, LayoutDashboard, LogOut } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Actor } from "@/domain/actor";
import {
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_ITEMS,
  type AdminNavBadgeKey,
  type AdminNavGroupKey,
} from "./nav-items";

interface AdminSidebarProps {
  actor: Actor;
  displayName: string;
  roleLabel: string;
  counts: Partial<Record<AdminNavBadgeKey, number>>;
}

function NavGroup({
  group,
  actor,
  counts,
  locale,
  pathname,
}: {
  group: AdminNavGroupKey;
  actor: Actor;
  counts: Partial<Record<AdminNavBadgeKey, number>>;
  locale: string;
  pathname: string;
}) {
  const t = useTranslations("admin.nav");
  const { isMobile, setOpenMobile } = useSidebar();
  const base = `/${locale}/dashboard/admin`;
  const items = ADMIN_NAV_ITEMS.filter(
    (item) => item.group === group && item.show(actor),
  );

  if (items.length === 0) return null;

  return (
    <SidebarGroup>
      {group !== null && (
        <SidebarGroupLabel>{t(`groups.${group}`)}</SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const Icon = item.icon;
            const href = item.href === null ? null : `${base}${item.href}`;
            const count = item.badge ? counts[item.badge] : undefined;

            if (href === null) {
              // A destination that needs its own spec before it can exist.
              // aria-disabled rather than disabled so it stays in the tab
              // order; the tooltip is the only place that says why.
              return (
                <SidebarMenuItem key={item.key}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton
                        aria-disabled="true"
                        onClick={(event) => event.preventDefault()}
                        className="cursor-not-allowed opacity-50"
                      >
                        <Icon aria-hidden="true" />
                        <span>{t(item.key)}</span>
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {t("comingSoon")}
                    </TooltipContent>
                  </Tooltip>
                </SidebarMenuItem>
              );
            }

            return (
              <SidebarMenuItem key={item.key}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === href}
                  tooltip={t(item.key)}
                >
                  <Link
                    href={href}
                    onClick={() => {
                      if (isMobile) setOpenMobile(false);
                    }}
                  >
                    <Icon aria-hidden="true" />
                    <span>{t(item.key)}</span>
                  </Link>
                </SidebarMenuButton>
                {!!count && count > 0 && (
                  <Badge
                    variant="secondary"
                    className="pointer-events-none absolute top-1.5 right-1 h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px] group-data-[collapsible=icon]:hidden"
                  >
                    {count}
                  </Badge>
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function NavUser({
  displayName,
  roleLabel,
}: {
  displayName: string;
  roleLabel: string;
}) {
  const t = useTranslations("admin.nav");
  const tAuth = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const { isMobile } = useSidebar();

  const handleLogout = async () => {
    await logoutAction();
    router.push(`/${locale}/login`);
  };

  const initial = (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold uppercase text-muted-foreground">
      {displayName.slice(0, 1)}
    </div>
  );

  const identity = (
    <div className="grid flex-1 text-left text-sm leading-tight">
      <span className="truncate font-medium">{displayName}</span>
      <span className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {roleLabel}
      </span>
    </div>
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              {initial}
              {identity}
              <ChevronsUpDown className="ml-auto size-4" aria-hidden="true" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5">
                {initial}
                {identity}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`/${locale}/dashboard`}>
                <LayoutDashboard
                  className="mr-2 size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                {t("memberDashboard")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handleLogout()}>
              <LogOut
                className="mr-2 size-4 text-muted-foreground"
                aria-hidden="true"
              />
              {tAuth("signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AdminSidebar({
  actor,
  displayName,
  roleLabel,
  counts,
}: AdminSidebarProps) {
  const t = useTranslations("admin.nav");
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <TooltipProvider delayDuration={200}>
      <Sidebar
        collapsible="icon"
        mobileTitle={`KCLUB — ${t("consoleLabel")}`}
        mobileDescription={t("navigationDescription")}
      >
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg">
                <Link href={`/${locale}/dashboard/admin`}>
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-black text-accent-foreground">
                    K
                  </div>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="text-sm font-black uppercase tracking-[0.18em] text-accent-ink">
                      KCLUB
                    </span>
                    <span className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      {t("consoleLabel")}
                    </span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {ADMIN_NAV_GROUPS.map((group) => (
            <NavGroup
              key={group ?? "root"}
              group={group}
              actor={actor}
              counts={counts}
              locale={locale}
              pathname={pathname}
            />
          ))}
        </SidebarContent>
        <SidebarFooter>
          <NavUser displayName={displayName} roleLabel={roleLabel} />
        </SidebarFooter>
        <SidebarRail label={t("toggleSidebar")} />
      </Sidebar>
    </TooltipProvider>
  );
}
