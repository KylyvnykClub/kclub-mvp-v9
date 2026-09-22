import { getLocale, getTranslations } from "next-intl/server";

import { KylReveal } from "./kyl-reveal";

import { Link } from "@/i18n/navigation";
import { landingStats, type ClubPresence } from "@/lib/club-stats";

/**
 * The hero, and the three figures the design puts at the bottom of it.
 *
 * Every number is read from the database (`getClubPresenceAction`). The
 * reference markup shipped "15+ / 9 / 4" as placeholders; these are counts, so
 * they are printed as counts, and a figure that is zero is left out rather than
 * announced. Nothing here identifies a member: three integers leave the server
 * and there is no link from any of them to a person (ADR 0005).
 */
export async function KylHero({ presence }: { presence: ClubPresence }) {
  const t = await getTranslations("home.kyl.hero");
  const locale = await getLocale();
  const format = new Intl.NumberFormat(locale);

  const stats = landingStats(presence);

  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="hero-content shell">
        <div className="hero-copy">
          <KylReveal as="h1" id="hero-title" className="hero-title">
            {t("titleLine1")} <br />
            <span>{t("titleLine2")}</span>
          </KylReveal>
          <KylReveal as="p" className="hero-description">
            {t("description")}
          </KylReveal>
          <KylReveal className="hero-cta">
            <Link className="button hero-primary" href="/register">
              {t("primaryCta")}
            </Link>
            <a className="button button-secondary" href="#about">
              {t("secondaryCta")}
            </a>
          </KylReveal>
        </div>
      </div>

      {stats.length > 0 && (
        <KylReveal
          className="hero-stats shell"
          aria-label={t("statsLabel")}
          style={{
            gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`,
          }}
        >
          {stats.map(({ key, value }) => (
            <div className="hero-stat" key={key}>
              <strong>{format.format(value)}</strong>
              <span>{t(key)}</span>
            </div>
          ))}
        </KylReveal>
      )}
    </section>
  );
}
