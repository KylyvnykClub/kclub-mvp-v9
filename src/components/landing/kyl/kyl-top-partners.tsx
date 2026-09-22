import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";

import { KylReveal } from "./kyl-reveal";
import {
  flagSrc,
  partnerTaxonomy,
  type TaxonomyIndex,
} from "./partner-presentation";

import type { PartnerCompanyView } from "@/data/companies";
import { Link } from "@/i18n/navigation";
import { countryName } from "@/lib/countries";
import type { Locale } from "@/i18n/routing";

/**
 * The three partners staff put in the "top" block (FR-035), in the design's
 * editorial card.
 *
 * Curated, not the catalogue: it renders what `showcaseType = 'top'` names and
 * nothing more, so scrolling the landing page never becomes a way to read the
 * whole partner list. With nothing curated the section renders nothing at all
 * rather than three placeholders - the prototype's Swiss Legal Group and Grand
 * Auto Premium were illustrations, and inventing partners is the one thing a
 * partner list must never do.
 *
 * The country is beside the service, not over the photograph, which is the
 * rule DESIGN_RULES.md states for this card.
 */
export async function KylTopPartners({
  partners,
  taxonomy,
}: {
  partners: PartnerCompanyView[];
  taxonomy: TaxonomyIndex;
}) {
  if (partners.length === 0) return null;

  const t = await getTranslations("home.kyl.top");
  const locale = (await getLocale()) as Locale;

  return (
    <section
      className="top-partners section"
      aria-labelledby="top-partners-title"
    >
      <div className="shell">
        <KylReveal className="reference-heading">
          <span aria-hidden="true" />
          <h2 id="top-partners-title">{t("title")}</h2>
          <span aria-hidden="true" />
        </KylReveal>

        <div className="top-partner-grid">
          {partners.map((partner) => {
            const label = partnerTaxonomy(
              partner.categories.map((c) => c.businessCategoryId),
              taxonomy,
            );
            const flag = flagSrc(partner.registrationCountryCode);
            const country = partner.registrationCountryCode
              ? countryName(partner.registrationCountryCode, locale)
              : null;
            const place = [country, label?.category]
              .filter(Boolean)
              .join(" · ");

            return (
              <KylReveal
                as="article"
                className="top-partner-card"
                key={partner.id}
              >
                <Link
                  href={`/directory/${partner.slug}`}
                  className="top-partner-link"
                >
                  <div
                    className={`top-partner-image${partner.logoUrl ? "" : " top-partner-image--empty"}`}
                  >
                    {partner.logoUrl ? (
                      <Image
                        src={partner.logoUrl}
                        alt=""
                        width={640}
                        height={440}
                        unoptimized
                        sizes="(max-width: 760px) 100vw, 400px"
                      />
                    ) : (
                      <span className="top-partner-initial" aria-hidden="true">
                        {partner.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="top-partner-copy">
                    {place && (
                      <p className="top-partner-location">
                        {flag && (
                          <span className="country-flag" aria-hidden="true">
                            <Image src={flag} alt="" width={20} height={14} />
                          </span>
                        )}
                        {place}
                      </p>
                    )}
                    <h3>{partner.name}</h3>
                    {partner.description && <p>{partner.description}</p>}
                    {partner.discount && <strong>{partner.discount}</strong>}
                  </div>
                </Link>
              </KylReveal>
            );
          })}
        </div>

        <a className="button-tertiary top-partners-all" href="#partners">
          {t("viewAll")}
        </a>
      </div>
    </section>
  );
}
