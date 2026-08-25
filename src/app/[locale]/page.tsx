import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getCurrentMember } from "@/actions/session";
import { AboutSection } from "@/components/landing/about-section";
import { BenefitsSection } from "@/components/landing/benefits-section";
import { CardShowcase } from "@/components/landing/card-showcase";
import { ShowcaseSection } from "@/components/landing/showcase-section";
import { CtaSection } from "@/components/landing/cta-section";
import { FaqSection } from "@/components/landing/faq-section";
import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { PrinciplesSection } from "@/components/landing/principles-section";
import { ServicesSection } from "@/components/landing/services-section";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { StatsSection } from "@/components/landing/stats-section";
import { JsonLd, organizationLd, websiteLd } from "@/components/seo/json-ld";
import { localeAlternates } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home.hero" });

  return {
    title: `KCLUB — ${t("titleLine2")}`,
    description: t("subline"),
    alternates: localeAlternates(locale, ""),
  };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await getCurrentMember();

  return (
    <div className="min-h-screen bg-background selection:bg-accent/30">
      <JsonLd data={websiteLd()} />
      <JsonLd data={organizationLd()} />
      <SiteHeader member={Boolean(current?.member)} />
      <main>
        <HeroSection />
        <StatsSection />
        <AboutSection />
        <BenefitsSection />
        <PrinciplesSection />
        <HowItWorksSection />
        <ServicesSection />
        <CardShowcase />
        <ShowcaseSection />
        <FaqSection />
        <CtaSection />
      </main>
      <SiteFooter />
    </div>
  );
}
