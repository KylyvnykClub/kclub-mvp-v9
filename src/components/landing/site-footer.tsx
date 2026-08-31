import Image from "next/image";
import { ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

const LEGAL_LINKS = [
  ["terms", "/legal/terms-of-use"],
  ["privacy", "/legal/privacy-policy"],
  ["cookiePolicy", "/legal/cookie-policy"],
  ["clubRules", "/legal/club-rules"],
  ["partnerRules", "/legal/partner-rules"],
  ["businessIntroRules", "/legal/business-introduction-rules"],
  ["refundPolicy", "/legal/refund-policy"],
  ["disclaimer", "/legal/disclaimer"],
  ["contactUs", "/legal/contact-us"],
] as const;

export function SiteFooter() {
  const t = useTranslations("home");

  return (
    <footer className="border-t border-border bg-zinc-100 text-zinc-950 dark:bg-[#18181a] dark:text-white">
      <div className="kclub-shell grid gap-12 py-14 md:grid-cols-[1.4fr_0.8fr_1.6fr]">
        <div>
          <div className="flex items-center gap-3">
            <Image
              src="/brand/logo/crow-emblem.png"
              width={48}
              height={48}
              alt=""
              className="size-12 rounded-full object-cover"
            />
            <span className="text-sm font-black uppercase tracking-[0.14em]">
              KYLYVNYK CLUB
            </span>
          </div>
          <p className="mt-5 max-w-sm text-sm font-light leading-7 text-zinc-600 dark:text-white/60">
            {t("footer.aboutText")}
          </p>
        </div>

        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {t("footer.links")}
          </h2>
          <ul className="mt-5 grid gap-3 text-sm font-normal">
            <li>
              <Link href="#about" className="hover:text-accent-ink">
                {t("nav.about")}
              </Link>
            </li>
            <li>
              <Link href="#how-it-works" className="hover:text-accent-ink">
                {t("nav.how_it_works")}
              </Link>
            </li>
            <li>
              <Link href="/directory" className="hover:text-accent-ink">
                {t("footer.directory")}
              </Link>
            </li>
            <li>
              <Link href="/register" className="hover:text-accent-ink">
                {t("footer.signUp")}
              </Link>
            </li>
            <li>
              <Link href="/login" className="hover:text-accent-ink">
                {t("footer.signIn")}
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {t("footer.legal")}
          </h2>
          <ul className="mt-5 grid gap-3 text-sm font-normal sm:grid-cols-2 sm:gap-x-8">
            {LEGAL_LINKS.map(([key, href]) => (
              <li key={key}>
                <Link href={href} className="hover:text-accent-ink">
                  {t(`footer.${key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="kclub-shell flex flex-wrap items-center justify-between gap-4 py-5 text-sm text-muted-foreground">
          <span>
            {new Date().getFullYear()} KYLYVNYK CLUB. {t("footer.copyright")}
          </span>
          {/* "#top" is special-cased by browsers: no matching id needed, and
              the html-level scroll-behavior makes it glide. No client JS. */}
          <a
            href="#top"
            className="inline-flex min-h-11 items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] transition-colors hover:text-accent-ink"
          >
            {t("footer.backToTop")}
            <ArrowUp className="size-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  );
}
