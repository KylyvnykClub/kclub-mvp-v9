import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  getPartnerCountryCodesAction,
  getPartnerLocationsAction,
} from "@/actions/company";
import { getCurrentMember } from "@/actions/session";
import { AboutSection } from "@/components/landing/about-section";
import { CategoryTilesSection } from "@/components/landing/category-tiles-section";
import { FaqSection } from "@/components/landing/faq-section";
import { HomeHero } from "@/components/landing/home-hero";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { MembershipOfferSection } from "@/components/landing/membership-offer-section";
import { PartnerSearchSection } from "@/components/landing/partner-search-section";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { TopPartnersSection } from "@/components/landing/top-partners-section";
import { WorldCommunitySection } from "@/components/landing/world-community-section";
import { db } from "@/data/db";
import {
  listLocalizedCategoryBlocks,
  listLocalizedCategoryTree,
} from "@/data/companies";
import { buildActor, staffAtLeast } from "@/domain/actor";
import type { Locale } from "@/i18n/routing";
import { JsonLd, organizationLd, websiteLd } from "@/components/seo/json-ld";
import { localeAlternates } from "@/lib/seo";

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
  const t = await getTranslations({ locale, namespace: "home.hero" });

  return {
    title: `Kylyvnyk Club — ${t("metaTitle")}`,
    description: `${t("eyebrow")} — ${t("subline")}`,
    alternates: localeAlternates(locale, ""),
  };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const current = await getCurrentMember();
  const actor = current?.member ? buildActor(current.member) : null;
  const canAccessAdmin = actor ? staffAtLeast(actor, "staff_support") : false;

  const t = await getTranslations("home.landing.search");

  const [categories, blocks, locations, countryCodes] = await Promise.all([
    SKIP_DB_PRERENDER ? [] : listLocalizedCategoryTree(db, locale as Locale),
    SKIP_DB_PRERENDER ? [] : listLocalizedCategoryBlocks(db, locale as Locale),
    getPartnerLocationsAction(),
    getPartnerCountryCodesAction(),
  ]);

  return (
    // `dark` is scoped to the landing page rather than set on the document:
    // the catalogue, the dashboard and the console keep the reader's own theme
    // choice, and only this page is always the dark one the club asked for.
    <div className="dark min-h-screen bg-[#07090f] text-white selection:bg-[#d4af37]/30">
      <JsonLd data={websiteLd()} />
      <JsonLd data={organizationLd()} />
      <SiteHeader member={Boolean(current?.member)} admin={canAccessAdmin} />
      <main>
        <HomeHero />
        <TopPartnersSection />
        <MembershipOfferSection />
        <PartnerSearchSection
          categories={categories}
          locations={locations}
          labels={{
            title: t("title"),
            placeholder: t("placeholder"),
            submit: t("submit"),
            country: t("country"),
            city: t("city"),
            block: t("block"),
            category: t("category"),
            subcategory: t("subcategory"),
            anyCountry: t("anyCountry"),
            anyCity: t("anyCity"),
            anyBlock: t("anyBlock"),
            anyCategory: t("anyCategory"),
            anySubcategory: t("anySubcategory"),
            subcategoryHint: t("subcategoryHint"),
          }}
        />
        <CategoryTilesSection blocks={blocks} />
        <WorldCommunitySection countryCodes={countryCodes} />
        {/* Kept below the fold because the header still links to them, and
            because they are the page's only prose for a search engine. */}
        <AboutSection />
        <HowItWorksSection />
        <FaqSection />
      </main>
      <SiteFooter />
    </div>
  );
}
