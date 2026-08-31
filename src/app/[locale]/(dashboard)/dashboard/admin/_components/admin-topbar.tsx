"use client";

import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { ADMIN_NAV_ITEMS } from "./nav-items";

export function AdminTopbar() {
  const t = useTranslations("admin.nav");
  const locale = useLocale();
  const pathname = usePathname();
  const base = `/${locale}/dashboard/admin`;

  const activeItem = ADMIN_NAV_ITEMS.find(
    (item) => item.href !== null && pathname === `${base}${item.href}`,
  );

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur-xl sm:px-6">
      <SidebarTrigger className="-ml-1" label={t("toggleSidebar")} />
      <Separator
        orientation="vertical"
        className="mx-1 data-[orientation=vertical]:h-4"
      />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-bold text-foreground">
          {activeItem ? t(activeItem.key) : t("overview")}
        </h2>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
