"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { KylSelect } from "./kyl-select";

import { logoutAction } from "@/actions/auth";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { locales, type Locale } from "@/i18n/routing";

/**
 * The landing page's own header, to the client's design.
 *
 * `SiteHeader` still serves the catalogue, the dashboard and the console; this
 * one is the pill-shaped floating bar the design asks for and is imported by
 * the landing page alone. Two headers is a deliberate cost: the redesign was
 * commissioned for the home page, and quietly restyling the signed-in chrome
 * with it would be a change nobody asked for.
 *
 * The behaviour behind the markup is the real one - the language control
 * switches locale through the router, and the actions change with the session,
 * so a signed-in member is not invited to sign in again.
 */
function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

const LANGUAGE_NAMES: Record<Locale, string> = {
  en: "English",
  ru: "Рус",
  uk: "Українська",
};

/**
 * The flag is the country the language is written in, never the locale code.
 * "uk" is Ukrainian in ISO 639 and the United Kingdom in ISO 3166, and a
 * compact switcher that printed the code once put a Ukrainian flag beside
 * "United Kingdom" for a member on a phone.
 */
const LANGUAGE_FLAGS: Record<Locale, string> = {
  en: "/flags/gb.png",
  ru: "/flags/ru.png",
  uk: "/flags/ua.png",
};

export function KylHeader({
  member,
  admin,
}: {
  member: boolean;
  admin: boolean;
}) {
  const t = useTranslations("home.kyl.nav");
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [locale, setLocale] = useState<Locale>("en");

  // The locale is read from the document rather than from `useLocale()` so the
  // select shows what the URL says even when a translation is missing.
  useEffect(() => {
    const current = document.documentElement.lang;
    if (isLocale(current)) setLocale(current);
  }, []);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  // The menu locks the page behind it. The class goes on `body`, which is the
  // element that scrolls; `.kyl` is a div and cannot hold it.
  useEffect(() => {
    document.body.classList.toggle("kyl-menu-open", open);
    return () => document.body.classList.remove("kyl-menu-open");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function changeLocale(next: string) {
    if (!isLocale(next)) return;
    setOpen(false);
    router.replace(pathname, { locale: next });
  }

  function signOut() {
    setOpen(false);
    // Fire and forget: the redirect below is what the reader sees, and an
    // `onClick` that returns a promise is a floating promise to the linter and
    // an unhandled rejection to the browser.
    void logoutAction().then(() => router.push("/login"));
  }

  const sections = [
    ["#about", t("about")],
    ["#how-it-works", t("howItWorks")],
    ["#partners", t("partners")],
  ] as const;

  const languageOptions = locales.map((code) => ({
    value: code,
    label: LANGUAGE_NAMES[code],
    icon: LANGUAGE_FLAGS[code],
  }));

  const languageSelect = (variant: "desktop" | "mobile") => (
    <div className={`language-control language-control--${variant}`}>
      <KylSelect
        label={t("language")}
        value={locale}
        options={languageOptions}
        onChange={changeLocale}
      />
    </div>
  );

  return (
    <header className={`site-header${scrolled ? " is-scrolled" : ""}`}>
      <div className="header-inner shell">
        <Link className="brand" href="/" aria-label={t("home")}>
          <Image
            className="brand-emblem"
            src="/brand/logo/emblem.png"
            alt=""
            width={39}
            height={48}
            priority
          />
          <Image
            className="brand-wordmark"
            src="/brand/logo/wordmark.png"
            alt=""
            width={104}
            height={25}
            priority
          />
        </Link>

        <nav className="desktop-nav" aria-label={t("primary")}>
          {sections.map(([href, label]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          {member ? (
            <>
              <button className="text-link" type="button" onClick={signOut}>
                {t("signOut")}
              </button>
              <Link className="button button-small" href="/dashboard">
                {t("account")}
              </Link>
            </>
          ) : (
            <>
              <Link className="text-link" href="/login">
                {t("signIn")}
              </Link>
              <Link className="button button-small" href="/register">
                {t("join")}
              </Link>
            </>
          )}
          {languageSelect("desktop")}
          <button
            className="menu-toggle"
            type="button"
            aria-label={open ? t("close") : t("open")}
            aria-expanded={open}
            aria-controls="kyl-mobile-menu"
            onClick={() => setOpen((value) => !value)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      <nav
        id="kyl-mobile-menu"
        className={`mobile-menu${open ? " is-open" : ""}`}
        aria-label={t("mobile")}
      >
        {sections.map(([href, label]) => (
          <a key={href} href={href} onClick={() => setOpen(false)}>
            {label}
          </a>
        ))}
        <a href="#membership" onClick={() => setOpen(false)}>
          {t("pricing")}
        </a>
        <a href="#faq" onClick={() => setOpen(false)}>
          {t("faq")}
        </a>
        {member ? (
          <>
            {admin && (
              <Link href="/dashboard/admin" onClick={() => setOpen(false)}>
                {t("console")}
              </Link>
            )}
            <Link href="/dashboard" onClick={() => setOpen(false)}>
              {t("dashboard")}
            </Link>
            <button className="button" type="button" onClick={signOut}>
              {t("signOut")}
            </button>
          </>
        ) : (
          <>
            <Link href="/login" onClick={() => setOpen(false)}>
              {t("signIn")}
            </Link>
            <Link
              className="button"
              href="/register"
              onClick={() => setOpen(false)}
            >
              {t("join")}
            </Link>
          </>
        )}
        {languageSelect("mobile")}
      </nav>
    </header>
  );
}
