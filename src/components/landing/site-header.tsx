"use client";

import Image from "next/image";
import { LogOut, Menu, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { logoutAction } from "@/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

const navigation = [
  ["about", "/#about"],
  ["how_it_works", "/#how-it-works"],
  ["partners", "/directory"],
  ["faq", "/#faq"],
] as const;

export function SiteHeader({ member = false }: { member?: boolean }) {
  const t = useTranslations("home");
  const tAuth = useTranslations("auth");
  const tDashboard = useTranslations("dashboard");
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as Locale;
  const [open, setOpen] = useState(false);

  function changeLocale(newLocale: Locale) {
    router.replace(pathname, { locale: newLocale });
  }

  async function handleLogout() {
    await logoutAction();
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-50 h-[72px] border-b border-zinc-200/80 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-[#101012]/90">
      <div className="kclub-shell flex h-full items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3" aria-label="KCLUB">
          <Image
            src="/brand/logo/crown-gold-logo.png"
            width={40}
            height={28}
            alt=""
            className="h-7 w-10 object-contain"
            priority
          />
          <span className="text-lg font-black tracking-[0.06em] text-zinc-950 dark:text-accent-ink">
            KYLYVNYK CLUB
          </span>
        </Link>

        <nav
          className="hidden items-center gap-5 lg:flex"
          aria-label={t("common.primaryNav")}
        >
          {navigation.map(([key, href]) => (
            <Link
              key={key}
              href={href}
              className="border-b border-transparent py-1 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-600 transition-colors hover:border-accent hover:text-zinc-950 dark:text-white/65 dark:hover:text-white"
            >
              {t(`nav.${key}`)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div
            className="hidden items-center gap-1 lg:flex"
            aria-label={t("common.languageSwitcher")}
          >
            {(["en", "ru", "uk"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => changeLocale(item)}
                aria-pressed={locale === item}
                className={`min-h-10 px-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
                  locale === item
                    ? "text-accent-ink"
                    : "text-muted-foreground hover:text-zinc-950 dark:hover:text-white"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <ThemeToggle />
          {member ? (
            <>
              <Link
                href="/dashboard/profile"
                className="hidden px-3 text-xs font-bold uppercase tracking-[0.12em] lg:inline-flex"
              >
                {tDashboard("profile")}
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleLogout()}
                className="hidden h-10 rounded-none px-3 text-muted-foreground lg:inline-flex"
              >
                <LogOut className="size-4" aria-hidden="true" />
                {tAuth("signOut")}
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden px-3 text-xs font-bold uppercase tracking-[0.12em] lg:inline-flex"
              >
                {t("nav.signIn")}
              </Link>
              <Link
                href="/register"
                className="kclub-brand-button hidden lg:inline-flex"
              >
                {t("nav.join")} <span aria-hidden="true">↗</span>
              </Link>
            </>
          )}
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center lg:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            aria-label={open ? t("common.close") : t("common.menu")}
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-navigation"
          className="border-b border-border bg-background/95 px-4 py-5 backdrop-blur-xl lg:hidden"
          aria-label={t("common.mobileNav")}
        >
          <div className="mx-auto grid max-w-7xl gap-1">
            {navigation.map(([key, href]) => (
              <Link
                key={key}
                href={href}
                onClick={() => setOpen(false)}
                className="border-b border-border py-3 text-sm font-semibold uppercase tracking-[0.12em]"
              >
                {t(`nav.${key}`)}
              </Link>
            ))}
            <div className="mt-4 flex items-center gap-2 border-t border-border pt-4 lg:hidden">
              {(["en", "ru", "uk"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => changeLocale(item)}
                  aria-pressed={locale === item}
                  className="min-h-11 border border-border px-4 text-xs font-bold uppercase"
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="mt-4 grid gap-2 border-t border-border pt-4 lg:hidden">
              {member ? (
                <>
                  <Link
                    href="/dashboard/profile"
                    onClick={() => setOpen(false)}
                    className="border border-border px-4 py-3 text-sm font-bold uppercase tracking-[0.12em]"
                  >
                    {tDashboard("profile")}
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setOpen(false);
                      void handleLogout();
                    }}
                    className="h-11 justify-start rounded-none border border-border px-4"
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    {tAuth("signOut")}
                  </Button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="border border-border px-4 py-3 text-sm font-bold uppercase tracking-[0.12em]"
                  >
                    {t("nav.signIn")}
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setOpen(false)}
                    className="kclub-brand-button justify-center"
                  >
                    {t("nav.join")} <span aria-hidden="true">↗</span>
                  </Link>
                </>
              )}
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
