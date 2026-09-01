"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { ADMIN_NAV_ITEMS } from "./nav-items";

/**
 * The topbar is wayfinding, not a title: `console › section`. The screen's
 * own `PageHeader` renders the single `h1`, so the two never say the same
 * thing twice. Section labels come from the same nav list as the sidebar,
 * which keeps the crumb and the highlighted rail item in agreement.
 */
export function AdminTopbar() {
  const t = useTranslations("admin.nav");
  const locale = useLocale();
  const pathname = usePathname();
  const base = `/${locale}/dashboard/admin`;

  const section = ADMIN_NAV_ITEMS.find(
    (item) =>
      item.href !== null &&
      item.href !== "" &&
      (pathname === `${base}${item.href}` ||
        pathname.startsWith(`${base}${item.href}/`)),
  );

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur-xl sm:px-6">
      <SidebarTrigger className="-ml-1" label={t("toggleSidebar")} />
      <Separator
        orientation="vertical"
        className="mx-1 data-[orientation=vertical]:h-4"
      />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="shrink-0">
            {section ? (
              <BreadcrumbLink asChild>
                <Link href={base}>{t("consoleLabel")}</Link>
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage>{t("consoleLabel")}</BreadcrumbPage>
            )}
          </BreadcrumbItem>
          {section && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate">
                  {t(section.key)}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
