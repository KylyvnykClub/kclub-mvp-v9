import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { CLUB_CONTACT_EMAIL } from "@/lib/contact";

/**
 * The design's footer, with the policy row made of real links.
 *
 * DESIGN_RULES.md says to keep the policy names as labels "until policy URLs
 * exist". They exist: `content/legal` holds the published documents and
 * `/legal/{id}` serves each one in all three languages, so a label here would
 * be hiding something the reader is entitled to read.
 */
const POLICIES = [
  ["privacy", "/legal/privacy-policy"],
  ["terms", "/legal/terms-of-use"],
  ["cookies", "/legal/cookie-policy"],
  ["disclaimer", "/legal/disclaimer"],
] as const;

export async function KylFooter() {
  const t = await getTranslations("home.kyl.footer");
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div className="footer-brand">
          <a className="brand" href="#top">
            <Image
              src="/brand/logo/crown-gold-logo.png"
              alt=""
              width={40}
              height={36}
            />
            <span>Kylyvnyk Club</span>
          </a>
          <p>{t("about")}</p>
        </div>
        <div>
          <h2>{t("explore")}</h2>
          <a href="#about">{t("aboutUs")}</a>
          <a href="#how-it-works">{t("howItWorks")}</a>
          <Link href="/directory">{t("directory")}</Link>
          <a href="#membership">{t("membership")}</a>
        </div>
        <div>
          <h2>{t("connect")}</h2>
          <a href={`mailto:${CLUB_CONTACT_EMAIL}`}>{CLUB_CONTACT_EMAIL}</a>
          <p>{t("community")}</p>
        </div>
      </div>

      <div className="shell footer-legal" aria-label={t("legalLabel")}>
        {POLICIES.map(([key, href]) => (
          <Link key={key} href={href}>
            {t(key)}
          </Link>
        ))}
        <Link href="/legal">{t("allLegal")}</Link>
      </div>

      <div className="shell footer-bottom">
        <span>© {year} Kylyvnyk Club</span>
        <a href="#top">{t("backToTop")}</a>
      </div>
    </footer>
  );
}
