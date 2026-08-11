import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPartnerBySlugAction } from "@/actions/company";
import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/actions/session";
import { isFeatureEnabled } from "@/actions/feature-flags";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Metadata, ResolvingMetadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Globe,
  Mail,
  Phone,
} from "lucide-react";
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
      <main className="min-h-screen bg-background pb-24">
        <section className="border-b border-border bg-zinc-950 py-12 text-white sm:py-16">
          <div className="kclub-shell">
            <Link
              href={`/${locale}/directory`}
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-white/55 transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {tc("title")}
            </Link>

            <div className="mt-10 grid gap-10 lg:grid-cols-[auto_1fr_auto] lg:items-end">
              {partner.logoUrl ? (
                <div className="flex size-28 shrink-0 items-center justify-center border border-white/15 bg-white/5 p-3 sm:size-32">
                  <img
                    src={partner.logoUrl}
                    alt={tc("logoAlt", { name: partner.name })}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex size-28 shrink-0 items-center justify-center border border-accent/40 bg-accent/10 text-5xl font-black text-accent sm:size-32">
                  {partner.name.charAt(0).toUpperCase()}
                </div>
              )}

              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge className="rounded-none bg-accent px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-accent-foreground hover:bg-accent">
                    {partner.businessCategory?.block} /{" "}
                    {partner.businessCategory?.category}
                  </Badge>
                </div>
                <h1 className="mt-5 text-5xl font-black uppercase leading-[0.92] tracking-[-0.045em] sm:text-7xl">
                  {partner.name}
                </h1>
                {partner.legalName && (
                  <p className="mt-4 text-sm font-light leading-6 text-white/55">
                    {partner.legalName}
                  </p>
                )}
              </div>

              {partner.discount && (
                <div className="border border-accent bg-accent px-5 py-4 text-sm font-black uppercase tracking-[0.12em] text-accent-foreground lg:max-w-64">
                  <p className="mb-2 text-[10px] tracking-[0.18em] opacity-70">
                    KCLUB
                  </p>
                  <p>{partner.discount}</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="kclub-shell mt-10">
          <div className="grid gap-px border border-border bg-border lg:grid-cols-[1fr_0.45fr]">
            <div className="space-y-10 bg-background p-6 sm:p-10">
              <section>
                <p className="kclub-eyebrow">{tc("aboutSection")}</p>
                <h2 className="mt-5 text-3xl font-black uppercase leading-tight tracking-[-0.02em]">
                  {tc("aboutSection")}
                </h2>
                <p className="mt-5 max-w-3xl whitespace-pre-wrap text-base font-light leading-8 text-muted-foreground">
                  {partner.description || tc("noDescription")}
                </p>
              </section>

              <section className="border-t border-border pt-8">
                <p className="kclub-eyebrow">{tc("activitiesSection")}</p>
                <h2 className="mt-5 text-3xl font-black uppercase leading-tight tracking-[-0.02em]">
                  {tc("activitiesSection")}
                </h2>
                <div className="mt-5 inline-flex border border-border px-4 py-3 text-sm font-bold uppercase tracking-[0.12em]">
                  {partner.businessCategory.subcategory}
                </div>
              </section>
            </div>

            <aside className="bg-muted/30 p-6 sm:p-8">
              <div className="sticky top-24 space-y-7">
                <div>
                  <p className="kclub-eyebrow">{tc("contactSection")}</p>
                  <h2 className="mt-5 text-2xl font-black uppercase leading-tight tracking-[-0.02em]">
                    {tc("contactSection")}
                  </h2>
                </div>

                <ul className="space-y-3">
                  {partner.website && (
                    <li className="border border-border bg-background px-4 py-3 text-sm">
                      <a
                        href={partner.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-3 transition-colors hover:text-accent"
                      >
                        <span className="inline-flex min-w-0 items-center gap-3">
                          <Globe
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span className="truncate">
                            {partner.website.replace(/^https?:\/\//, "")}
                          </span>
                        </span>
                        <ArrowUpRight className="size-4" aria-hidden="true" />
                      </a>
                    </li>
                  )}

                  {isResident ? (
                    <>
                      {partner.contactEmail && (
                        <li className="border border-border bg-background px-4 py-3 text-sm">
                          <a
                            href={`mailto:${partner.contactEmail}`}
                            className="flex min-w-0 items-center gap-3 transition-colors hover:text-accent"
                          >
                            <Mail
                              className="size-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            {partner.contactEmail}
                          </a>
                        </li>
                      )}
                      {partner.contactPhone && (
                        <li className="border border-border bg-background px-4 py-3 text-sm">
                          <a
                            href={`tel:${partner.contactPhone}`}
                            className="flex items-center gap-3 transition-colors hover:text-accent"
                          >
                            <Phone
                              className="size-4 text-muted-foreground"
                              aria-hidden="true"
                            />
                            {partner.contactPhone}
                          </a>
                        </li>
                      )}
                    </>
                  ) : (
                    <li className="border border-border bg-background p-4 text-sm font-light leading-6 text-muted-foreground">
                      {tc("contactsMembersOnly")}
                    </li>
                  )}
                </ul>

                {!isResident ? (
                  <div className="space-y-4 border-t border-border pt-6">
                    <p className="text-sm font-light leading-6 text-muted-foreground">
                      {tc("joinPrompt")}
                    </p>
                    <Button
                      asChild
                      className="h-12 w-full rounded-none bg-accent text-xs font-black uppercase tracking-[0.16em] text-accent-foreground hover:bg-[#b49126]"
                    >
                      <Link href={`/${locale}/login`}>{tc("joinCta")}</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-5 border-t border-border pt-6">
                    <div className="border border-border bg-background p-4">
                      <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                        <BadgeCheck
                          className="size-4 text-accent"
                          aria-hidden="true"
                        />
                        {tc("representedBy")}
                      </p>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm text-muted-foreground">
                          {tc("managerRole")}
                        </span>
                        <span className="text-right text-sm font-bold text-foreground">
                          {partner.owner?.displayName || tc("memberFallback")}
                        </span>
                      </div>
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
            </aside>
          </div>
        </section>
      </main>
    </>
  );
}
