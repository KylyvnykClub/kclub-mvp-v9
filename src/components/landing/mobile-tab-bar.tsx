"use client";

import { CreditCard, Home, LayoutGrid } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";

/**
 * The app-style bar pinned to the bottom of the landing page on a phone.
 *
 * Three destinations, as the reference has them. "Card" is the member's own
 * club card, which lives on the profile - a signed-out visitor is sent to
 * sign-in rather than to a page that would redirect them there anyway.
 *
 * `lg:hidden`, so the desktop layout is untouched; the page reserves the bar's
 * height at the bottom so the footer is never covered by it.
 */
export function MobileTabBar({ member = false }: { member?: boolean }) {
  const t = useTranslations("home.landing.tabs");
  const pathname = usePathname();

  const tabs = [
    { key: "home", href: "/", icon: Home },
    {
      key: "card",
      href: member ? "/dashboard/profile" : "/login",
      icon: CreditCard,
    },
    { key: "catalogue", href: "/directory", icon: LayoutGrid },
  ] as const;

  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#d4af37]/25 bg-[#0b0d14]/95 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-md grid-cols-3">
        {tabs.map(({ key, href, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname === href;

          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] transition-colors ${
                  active ? "text-[#e8c66a]" : "text-white/55 hover:text-white"
                }`}
              >
                <Icon className="size-5" aria-hidden />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
