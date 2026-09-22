import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  getPartnerLocationsAction,
  getPublicShowcasePartners,
} from "@/actions/company";
import { getClubPresenceAction } from "@/actions/club-presence";
import { searchLandingPartnersAction } from "@/actions/landing-search";
import { getCurrentMember } from "@/actions/session";
import { KylAbout } from "@/components/landing/kyl/kyl-about";
import { KylDirectory } from "@/components/landing/kyl/kyl-directory";
import { KylFaq } from "@/components/landing/kyl/kyl-faq";
import { KylFinalCta } from "@/components/landing/kyl/kyl-final-cta";
import { KylFooter } from "@/components/landing/kyl/kyl-footer";
import { KylHeader } from "@/components/landing/kyl/kyl-header";
import { KylHero } from "@/components/landing/kyl/kyl-hero";
import { KylMembership } from "@/components/landing/kyl/kyl-membership";
import { KylProcess } from "@/components/landing/kyl/kyl-process";
import { KylTopPartners } from "@/components/landing/kyl/kyl-top-partners";
import { buildTaxonomyIndex } from "@/components/landing/kyl/partner-presentation";
import { JsonLd, organizationLd, websiteLd } from "@/components/seo/json-ld";
import { db } from "@/data/db";
import {
  listLocalizedCategoryBlocks,
  listLocalizedCategoryLabels,
} from "@/data/companies";
import { buildActor, staffAtLeast } from "@/domain/actor";
import type { Locale } from "@/i18n/routing";
import { countryName } from "@/lib/countries";
import { localeAlternates } from "@/lib/seo";

import "../kylyvnyk-landing.css";

type Props = {
  params: Promise<{ locale: string }>;
};

/**
 * The taxonomy and the location options are read during prerender, so a build
 * without a database (`KCLUB_SKIP_DB_PRERENDER`) must not reach for one. The
 * actions already return empty for that case; the two direct reads here need
 * the same guard, and the sections they feed render nothing when empty.
 */
const SKIP_DB_PRERENDER = process.env.KCLUB_SKIP_DB_PRERENDER === "1";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home.kyl.meta" });

  return {
    title: t("title"),
    description: t("description"),
    alternates: localeAlternates(locale, ""),
  };
}

/**
 * The landing page, to the client's delivered design.
 *
 * The markup is the Kylyvnyk-Landing prototype's, section for section, and the
 * stylesheet imported above is that prototype's `styles.css`. What changed is
 * everything behind it: the figures under the hero are counted in the database,
 * the three top cards are the partners staff curated, the directory is the
 * catalogue's own search behind the catalogue's own gate, and every price comes
 * from `@/domain/pricing`. Nothing on this page is written into the markup
 * twice, and nothing is invented - a section with no data renders nothing.
 */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const current = await getCurrentMember();
  const actor = current?.member ? buildActor(current.member) : null;
  const member = Boolean(current?.member);
  const admin = actor ? staffAtLeast(actor, "staff_support") : false;

  const [presence, showcase, catalogue, locations, blocks] = await Promise.all([
    getClubPresenceAction(),
    getPublicShowcasePartners(),
    searchLandingPartnersAction({ locale: locale as Locale }),
    getPartnerLocationsAction(),
    SKIP_DB_PRERENDER ? [] : listLocalizedCategoryBlocks(db, locale as Locale),
  ]);

  const showcaseCategoryIds = [
    ...new Set(
      showcase.top.flatMap((partner) =>
        partner.categories.map((entry) => entry.businessCategoryId),
      ),
    ),
  ];
  const taxonomy = buildTaxonomyIndex(
    SKIP_DB_PRERENDER
      ? []
      : await listLocalizedCategoryLabels(
          db,
          locale as Locale,
          showcaseCategoryIds,
        ),
  );

  const countries = [...new Set(locations.map((entry) => entry.country))]
    .map((code) => ({
      value: code,
      label: countryName(code, locale as Locale),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));

  const cities = locations
    .filter((entry): entry is { country: string; city: string } =>
      Boolean(entry.city),
    )
    .map((entry) => ({
      value: entry.city,
      label: entry.city,
      country: entry.country,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));

  const t = await getTranslations("home.kyl");

  return (
    // The design is a dark page and always was. `dark` is scoped here rather
    // than set on the document, so the catalogue, the dashboard and the console
    // keep whichever theme the reader chose.
    <div className="kyl dark">
      <JsonLd data={websiteLd()} />
      <JsonLd data={organizationLd()} />

      <a className="skip-link" href="#main">
        {t("skip")}
      </a>

      <KylHeader member={member} admin={admin} />

      <main id="main">
        <KylHero presence={presence} />
        <KylTopPartners partners={showcase.top} taxonomy={taxonomy} />
        <KylMembership member={member} />
        <KylProcess />
        <KylDirectory
          initial={catalogue.rows}
          total={catalogue.total}
          locale={locale as Locale}
          countries={countries}
          cities={cities}
          blocks={blocks.map((entry) => ({
            value: entry.key,
            label: entry.label,
          }))}
        />
        <KylAbout />
        <KylFaq />
        <KylFinalCta member={member} />
      </main>

      <KylFooter />
    </div>
  );
}
