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
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
            {t("footer.links")}
          </h2>
          <ul className="mt-5 grid gap-3 text-sm font-normal">
            <li>
              <Link href="#about" className="hover:text-accent">
                {t("nav.about")}
              </Link>
            </li>
            <li>
              <Link href="#how-it-works" className="hover:text-accent">
                {t("nav.how_it_works")}
              </Link>
            </li>
            <li>
              <Link href="/register" className="hover:text-accent">
                {t("footer.signUp")}
              </Link>
            </li>
            <li>
              <Link href="/login" className="hover:text-accent">
                {t("footer.signIn")}
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
            {t("footer.legal")}
          </h2>
          <ul className="mt-5 grid gap-3 text-sm font-normal">
            <li>
              <Link href="/legal/terms" className="hover:text-accent">
                {t("footer.terms")}
              </Link>
            </li>
            <li>
              <Link href="/legal/privacy" className="hover:text-accent">
                {t("footer.privacy")}
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="kclub-shell py-5 text-sm text-zinc-500">
          {new Date().getFullYear()} KYLYVNYK CLUB. {t("footer.copyright")}
        </div>
      </div>
    </footer>
  );
}
