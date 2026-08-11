import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPartnerBySlugAction } from "@/actions/company";
import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/actions/session";
import { isFeatureEnabled } from "@/actions/feature-flags";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Metadata, ResolvingMetadata } from "next";
import Link from "next/link";
import { Globe, Mail, Phone, ExternalLink } from "lucide-react";
import { SendReferralDialog } from "./_components/send-referral-dialog";
import { db } from "@/data/db";
import { findActiveSubscriptionByPrice } from "@/data/billing";
import { listApprovedCompaniesWithSubscriptionsByOwner } from "@/data/companies";
import { configuredCheckoutPriceId } from "@/modules/billing/prices";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

// Next.js Dynamic SEO Metadata
export async function generateMetadata(
  { params }: Props,
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "catalogue" });
  const partner = await getPartnerBySlugAction(slug);

  if (!partner) {
    return { title: t("notFoundMetaTitle") };
  }

  const title = t("partnerMetaTitle", { name: partner.name });
  const description =
    partner.description?.substring(0, 160) ||
    t("partnerMetaDescription", { name: partner.name });

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: partner.logoUrl ? [{ url: partner.logoUrl }] : [],
    },
  };
}

export default async function PartnerLandingPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const session = await getCurrentMember();
  if (!session?.member) {
    const isPublic = await isFeatureEnabled("public_catalogue");
    if (!isPublic) {
      redirect(`/${locale}/login`);
    }
  }

  const partner = await getPartnerBySlugAction(slug);

  if (!partner) {
    notFound();
  }

  const isResident = !!session?.member;

  let canSendReferral = false;
  if (session?.member?.canSendReferrals) {
    let vipPriceId: string | null = null;
    try {
      vipPriceId = configuredCheckoutPriceId("vip");
    } catch {
      vipPriceId = null;
    }

    if (vipPriceId) {
      const vipSub = await findActiveSubscriptionByPrice(
        db,
        session.member.id,
        vipPriceId,
      );

      if (vipSub) {
        const memberCompanies =
          await listApprovedCompaniesWithSubscriptionsByOwner(
            db,
            session.member.id,
          );

        canSendReferral = memberCompanies.some((c) =>
          c.subscriptions.some((s) => s.status === "active"),
        );
      }
    }
  }

  const tr = await getTranslations("Referral");
  const tc = await getTranslations("catalogue");
  const referralTranslations = {
    title: tr("title"),
    description: tr("description"),
    clientName: tr("clientName"),
    contactChannel: tr("contactChannel"),
    serviceNeeded: tr("serviceNeeded"),
    note: tr("note"),
    consentLabel: tr("consentLabel"),
    consentError: tr("consentError"),
    sendAction: tr("sendAction"),
    successMessage: tr("successMessage"),
    errorMessage: tr("errorMessage"),
  };

  // Generate JSON-LD Structured Data
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: partner.name,
    image: partner.logoUrl || "",
    description: partner.description || "",
    url: partner.website || "",
    telephone: partner.contactPhone || "",
    email: partner.contactEmail || "",
    address: {
      "@type": "PostalAddress",
      addressCountry: "UA", // Adjust based on your primary location
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="min-h-screen bg-background pt-12 pb-24">
        {/* Hero Section */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-card border border-border/50 p-8 relative overflow-hidden">
            {/* Background accent */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start">
              {partner.logoUrl ? (
                <div className="w-32 h-32 rounded-none bg-muted/20 border border-border/50 flex-shrink-0 flex items-center justify-center p-2">
                  <img
                    src={partner.logoUrl}
                    alt={tc("logoAlt", { name: partner.name })}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-32 h-32 rounded-none bg-accent/10 border border-accent/20 flex-shrink-0 flex items-center justify-center font-serif text-5xl text-accent">
                  {partner.name.charAt(0).toUpperCase()}
                </div>
              )}

              <div className="flex-1 space-y-4">
                <div>
                  <Badge className="bg-accent text-accent-foreground hover:bg-accent/90 uppercase text-[10px] tracking-wider font-bold">
                    {partner.businessCategory?.block} /{" "}
                    {partner.businessCategory?.category}
                  </Badge>
                  <h1 className="font-serif text-4xl md:text-5xl font-bold tracking-tight">
                    {partner.name}
                  </h1>
                  {partner.legalName && (
                    <p className="text-muted-foreground mt-1 text-sm">
                      {partner.legalName}
                    </p>
                  )}
                </div>

                {partner.discount && (
                  <div className="inline-flex bg-accent text-accent-foreground px-4 py-2 text-lg font-medium border border-accent">
                    {partner.discount}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Description */}
            <div className="lg:col-span-2 space-y-8">
              <div className="prose prose-invert max-w-none">
                <h2 className="font-serif text-2xl border-b border-border/50 pb-2 mb-4">
                  {tc("aboutSection")}
                </h2>
                <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed">
                  {partner.description || tc("noDescription")}
                </p>
              </div>

              <div className="prose prose-invert max-w-none">
                <h2 className="font-serif text-2xl border-b border-border/50 pb-2 mb-4">
                  {tc("activitiesSection")}
                </h2>
                <ul className="list-disc pl-5 text-muted-foreground">
                  <li>{partner.businessCategory.subcategory}</li>
                </ul>
              </div>
            </div>

            {/* Right Column: Contact & CTA */}
            <div className="space-y-6">
              <div className="bg-card/50 border border-border/50 p-6 space-y-6">
                <h3 className="font-serif text-xl border-b border-border/50 pb-2">
                  {tc("contactSection")}
                </h3>

                <ul className="space-y-4">
                  {partner.website && (
                    <li className="flex items-center text-sm">
                      <Globe className="w-4 h-4 mr-3 text-muted-foreground" />
                      <a
                        href={partner.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-accent transition-colors flex items-center"
                      >
                        {partner.website.replace(/^https?:\/\//, "")}
                        <ExternalLink className="w-3 h-3 ml-1 opacity-50" />
                      </a>
                    </li>
                  )}

                  {isResident ? (
                    <>
                      {partner.contactEmail && (
                        <li className="flex items-center text-sm">
                          <Mail className="w-4 h-4 mr-3 text-muted-foreground" />
                          <a
                            href={`mailto:${partner.contactEmail}`}
                            className="hover:text-accent transition-colors"
                          >
                            {partner.contactEmail}
                          </a>
                        </li>
                      )}
                      {partner.contactPhone && (
                        <li className="flex items-center text-sm">
                          <Phone className="w-4 h-4 mr-3 text-muted-foreground" />
                          <a
                            href={`tel:${partner.contactPhone}`}
                            className="hover:text-accent transition-colors"
                          >
                            {partner.contactPhone}
                          </a>
                        </li>
                      )}
                    </>
                  ) : (
                    <li className="text-sm text-muted-foreground italic bg-muted/20 p-3 border border-border/50">
                      {tc("contactsMembersOnly")}
                    </li>
                  )}
                </ul>

                {!isResident ? (
                  <div className="pt-4 space-y-4">
                    <p className="text-sm">{tc("joinPrompt")}</p>
                    <Button asChild className="w-full">
                      <Link href={`/${locale}/login`}>{tc("joinCta")}</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="pt-4 space-y-4">
                    <p className="text-xs text-muted-foreground">
                      {tc("representedBy")}
                    </p>
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-muted-foreground">
                        {tc("managerRole")}
                      </span>
                      <span className="font-medium text-foreground">
                        {partner.owner?.displayName || tc("memberFallback")}
                      </span>
                    </div>

                    {canSendReferral && (
                      <SendReferralDialog
                        recipientCompanyId={partner.id}
                        translations={referralTranslations}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
