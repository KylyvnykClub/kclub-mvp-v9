"use client";

import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/95 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="min-w-0 pl-14 lg:pl-0">
        <p className="truncate text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {t("consoleLabel")}
        </p>
        <h2 className="truncate text-sm font-bold text-foreground">
          {activeItem ? t(activeItem.key) : t("overview")}
        </h2>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <ThemeToggle />
      </div>
    </header>
  );
}
