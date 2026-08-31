"use client";

import Image from "next/image";
import { ChevronDown, LogOut, Menu, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { logoutAction } from "@/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

const navigation = [
  ["about", "/#about"],
  ["how_it_works", "/#how-it-works"],
  ["partners", "/directory"],
  ["faq", "/#faq"],
] as const;

/**
 * Language autonyms are deliberately not translated - every language names
 * itself, so the row a reader is looking for reads the same from any locale.
 */
const LOCALES = [
  { code: "en", flag: "/flags/gb.png", label: "English" },
  { code: "ru", flag: "/flags/ru.png", label: "Русский" },
  { code: "uk", flag: "/flags/ua.png", label: "Українська" },
] as const satisfies readonly { code: Locale; flag: string; label: string }[];

export function SiteHeader({
  member = false,
  admin = false,
  unreadCount = 0,
}: {
  member?: boolean;
  admin?: boolean;
  /**
   * Unread inbox count (FR-099), supplied by the dashboard layout. Public pages
   * render this header with no member and no prop, so they run no query and
   * show no badge.
   */
  unreadCount?: number;
}) {
  const t = useTranslations("home");
  const tAuth = useTranslations("auth");
  const tDashboard = useTranslations("dashboard");
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as Locale;
  const [open, setOpen] = useState(false);

  const currentLocale =
    LOCALES.find((item) => item.code === locale) ?? LOCALES[0];

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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="hidden h-10 gap-2 rounded-none px-2 text-xs font-semibold uppercase tracking-[0.12em] lg:inline-flex"
                aria-label={t("common.languageSwitcher")}
              >
                <Image
                  src={currentLocale.flag}
                  width={20}
                  height={14}
                  alt=""
                  className="h-3.5 w-5 rounded-[2px] object-cover"
                />
                {currentLocale.code}
                <ChevronDown className="size-3" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              {LOCALES.map((item) => (
                <DropdownMenuItem
                  key={item.code}
                  onClick={() => changeLocale(item.code)}
                  className={
                    locale === item.code ? "font-semibold text-accent-ink" : ""
                  }
                >
                  <Image
                    src={item.flag}
                    width={20}
                    height={14}
                    alt=""
                    className="mr-2 h-3.5 w-5 rounded-[2px] object-cover"
                  />
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <ThemeToggle />
          {member ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="hidden h-10 gap-2 rounded-none px-3 text-xs font-bold uppercase tracking-[0.12em] lg:inline-flex"
                >
                  {t("nav.myAccount")}
                  <UnreadBadge
                    count={unreadCount}
                    label={tDashboard("unreadLabel", { count: unreadCount })}
                  />
                  <ChevronDown className="size-3" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuItem asChild>
                  <Link
                    href="/dashboard/profile"
                    className="flex items-center gap-2"
                  >
                    {tDashboard("profile")}
                    <UnreadBadge
                      count={unreadCount}
                      label={tDashboard("unreadLabel", { count: unreadCount })}
                    />
                  </Link>
                </DropdownMenuItem>
                {admin && (
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/admin">{tDashboard("admin")}</Link>
                  </DropdownMenuItem>
                )}
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
                {t("nav.join")}
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
              {LOCALES.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => changeLocale(item.code)}
                  aria-pressed={locale === item.code}
                  className={`inline-flex min-h-11 items-center gap-2 border px-4 text-xs font-bold uppercase ${
                    locale === item.code
                      ? "border-accent text-accent-ink"
                      : "border-border"
                  }`}
                >
                  <Image
                    src={item.flag}
                    width={20}
                    height={14}
                    alt=""
                    className="h-3.5 w-5 rounded-[2px] object-cover"
                  />
                  {item.code}
                </button>
              ))}
            </div>
            <div className="mt-4 grid gap-2 border-t border-border pt-4 lg:hidden">
              {member ? (
                <>
                  {admin && (
                    <Link
                      href="/dashboard/admin"
                      onClick={() => setOpen(false)}
                      className="border border-border px-4 py-3 text-sm font-bold uppercase tracking-[0.12em]"
                    >
                      {tDashboard("admin")}
                    </Link>
                  )}
                  <Link
                    href="/dashboard/profile"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 border border-border px-4 py-3 text-sm font-bold uppercase tracking-[0.12em]"
                  >
                    {tDashboard("profile")}
                    <UnreadBadge
                      count={unreadCount}
                      label={tDashboard("unreadLabel", { count: unreadCount })}
                    />
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
                    {t("nav.join")}
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

/**
 * The unread inbox count (FR-099), rendered on the account menu trigger and
 * beside the Profile entry in both the desktop dropdown and the mobile drawer -
 * the member-link blocks in this file are hand-duplicated, so a shared
 * component is what keeps them from drifting.
 *
 * Renders nothing at zero: an empty badge is noise, and its absence is already
 * the message.
 */
function UnreadBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;

  return (
    <span
      aria-label={label}
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-black text-accent-foreground"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
