import Image from "next/image";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export function SiteFooter() {
  const t = useTranslations("home");

  return (
    <footer className="border-t border-border bg-zinc-100 text-zinc-950 dark:bg-[#18181a] dark:text-white">
      <div className="kclub-shell grid gap-12 py-14 md:grid-cols-[1.5fr_1fr_1fr]">
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
          <ul className="mt-5 grid gap-3 text-sm font-normal">
            <li>
              <Link
                href="/legal/terms-of-use"
                className="hover:text-accent-ink"
              >
                {t("footer.terms")}
              </Link>
            </li>
            <li>
              <Link
                href="/legal/privacy-policy"
                className="hover:text-accent-ink"
              >
                {t("footer.privacy")}
              </Link>
            </li>
            <li>
              <Link
                href="/legal/cookie-policy"
                className="hover:text-accent-ink"
              >
                {t("footer.cookiePolicy")}
              </Link>
            </li>
            <li>
              <Link href="/legal/club-rules" className="hover:text-accent-ink">
                {t("footer.clubRules")}
              </Link>
            </li>
            <li>
              <Link
                href="/legal/partner-rules"
                className="hover:text-accent-ink"
              >
                {t("footer.partnerRules")}
              </Link>
            </li>
            <li>
              <Link
                href="/legal/business-introduction-rules"
                className="hover:text-accent-ink"
              >
                {t("footer.businessIntroRules")}
              </Link>
            </li>
            <li>
              <Link
                href="/legal/refund-policy"
                className="hover:text-accent-ink"
              >
                {t("footer.refundPolicy")}
              </Link>
            </li>
            <li>
              <Link href="/legal/disclaimer" className="hover:text-accent-ink">
                {t("footer.disclaimer")}
              </Link>
            </li>
            <li>
              <Link href="/legal/contact-us" className="hover:text-accent-ink">
                {t("footer.contactUs")}
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="kclub-shell py-5 text-sm text-muted-foreground">
          {new Date().getFullYear()} KYLYVNYK CLUB. {t("footer.copyright")}
        </div>
      </div>
    </footer>
  );
}
