import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  getPartnerBySlugAction,
  getSimilarPartnersAction,
} from "@/actions/company";
import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/actions/session";
import { isFeatureEnabled } from "@/actions/feature-flags";
import { Button } from "@/components/ui/button";
import { Metadata, ResolvingMetadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Globe,
  Mail,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { SendReferralDialog } from "./_components/send-referral-dialog";
import { PartnerHero } from "./_components/partner-hero";
import {
  PartnerBusinessData,
  type BusinessDataRow,
} from "./_components/partner-business-data";
import { HowToSteps, SectionHeader } from "./_components/partner-sections";
import { PartnerCard } from "../_components/partner-card";
import { db } from "@/data/db";
import { findActiveSubscriptionByPrice } from "@/data/billing";
import { listApprovedCompaniesWithSubscriptionsByOwner } from "@/data/companies";
import { configuredCheckoutPriceId } from "@/modules/billing/prices";
import { countryFlag, countryName } from "@/lib/countries";
import { localeAlternates } from "@/lib/seo";
import { JsonLd, partnerLd } from "@/components/seo/json-ld";
import type { Locale } from "@/i18n/routing";

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
    alternates: localeAlternates(locale, `/directory/${slug}`),
    openGraph: {
      title,
      description,
      // Only override the site's default OG card when the partner has a logo;
      // otherwise fall through to it rather than shipping an imageless card.
      ...(partner.logoUrl ? { images: [{ url: partner.logoUrl }] } : {}),
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
  const tCompany = await getTranslations("company");

  const localizedCountry = partner.registrationCountryCode
    ? countryName(partner.registrationCountryCode, locale as Locale)
    : partner.country;

  const formatLabels = {
    offline_only: tCompany("businessFormatOffline"),
    online_only: tCompany("businessFormatOnline"),
    online_offline: tCompany("businessFormatHybrid"),
    on_site_service: tCompany("businessFormatOnSite"),
  } as const;

  const taxonomy = partner.categories?.[0]?.businessCategory;
  const taxonomyLabel =
    [taxonomy?.category, taxonomy?.subcategory].filter(Boolean).join(" · ") ||
    null;

  const subcategories = (partner.categories ?? [])
    .map((c) => c.businessCategory?.subcategory)
    .filter((s): s is string => Boolean(s));

  // The cover is the first uploaded photo and the gallery is the rest, so a
  // partner's opening image is never shown twice on the same page.
  const coverImage = partner.images[0] ?? null;
  const galleryImages = partner.images.slice(1);

  const serviceCountryLabels = partner.serviceCountries.map((item) => ({
    code: item.countryCode,
    flag: countryFlag(item.countryCode),
    name: countryName(item.countryCode, locale as Locale),
  }));
  const worldwide = partner.servesWorldwide === 1;

  const heroBadges = [
    tc("verifiedPartner"),
    localizedCountry
      ? `${partner.registrationCountryCode ? `${countryFlag(partner.registrationCountryCode)} ` : ""}${localizedCountry}`
      : null,
    partner.businessFormat ? formatLabels[partner.businessFormat] : null,
  ].filter((b): b is string => Boolean(b));

  const businessDataRows: BusinessDataRow[] = [
    localizedCountry
      ? {
          label: tCompany("registrationCountryLabel"),
          value: `${partner.registrationCountryCode ? `${countryFlag(partner.registrationCountryCode)} ` : ""}${localizedCountry}`,
        }
      : null,
    worldwide || serviceCountryLabels.length > 0
      ? {
          label: tCompany("serviceCountriesLabel"),
          value: worldwide
            ? tCompany("worldwideLabel")
            : serviceCountryLabels.map((c) => c.name).join(", "),
        }
      : null,
    partner.businessFormat
      ? {
          label: tCompany("businessFormatLabel"),
          value: formatLabels[partner.businessFormat],
        }
      : null,
    partner.administrativeLevel1
      ? {
          label: tCompany("administrativeLevel1Label"),
          value: partner.administrativeLevel1,
        }
      : null,
    partner.administrativeLevel2
      ? {
          label: tCompany("administrativeLevel2Label"),
          value: partner.administrativeLevel2,
        }
      : null,
    partner.city ? { label: tCompany("cityLabel"), value: partner.city } : null,
    taxonomy?.block
      ? { label: tCompany("blockLabel"), value: taxonomy.block }
      : null,
    taxonomy?.category
      ? { label: tCompany("categoryLabel"), value: taxonomy.category }
      : null,
    subcategories.length > 0
      ? { label: tc("subcategoriesLabel"), tags: subcategories }
      : null,
  ].filter((row): row is BusinessDataRow => row !== null);

  const howToSteps = [
    {
      num: "01",
      title: tc("howToStep1Title"),
      note: tc("howToStep1Note"),
    },
    {
      num: "02",
      title: tc("howToStep2Title"),
      note: tc("howToStep2Note"),
    },
    {
      num: "03",
      title: tc("howToStep3Title"),
      note: tc("howToStep3Note"),
    },
  ];

  const similar = await getSimilarPartnersAction(
    partner.id,
    (partner.categories ?? []).map((c) => c.businessCategoryId),
  );

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

  return (
    <>
      <JsonLd
        data={partnerLd({
          name: partner.name,
          slug: partner.slug,
          description: partner.description,
          website: partner.website,
          logoUrl: partner.logoUrl,
          country: partner.country,
          city: partner.city,
          contactPhone: partner.contactPhone,
          contactEmail: partner.contactEmail,
        })}
      />
      <main className="min-h-screen bg-background pb-24">
        <div className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
          <div className="kclub-shell flex h-15 items-center gap-5">
            <Link
              href={`/${locale}/directory`}
              className="inline-flex shrink-0 items-center gap-2 text-[13px] text-muted-foreground transition-colors hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {tc("title")}
            </Link>
            {taxonomyLabel && (
              <>
                <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
                <span className="truncate text-[13px] text-muted-foreground/70">
                  {taxonomyLabel}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="kclub-shell">
          <PartnerHero
            name={partner.name}
            coverSrc={coverImage ? `/api/company-image/${coverImage.id}` : null}
            coverAlt={tc("coverAlt", { name: partner.name })}
            logoUrl={partner.logoUrl}
            logoAlt={tc("logoAlt", { name: partner.name })}
            badges={heroBadges}
            location={
              [partner.city, partner.country].filter(Boolean).join(" · ") ||
              null
            }
            taxonomy={taxonomyLabel}
            since={tc("partnerSince", {
              year: partner.createdAt.getFullYear(),
            })}
            conditions={
              partner.discount
                ? {
                    title: tc("conditionsTitle"),
                    value: isResident
                      ? partner.discount
                      : tc("conditionsLockedValue"),
                    note: isResident
                      ? tc("conditionsNote")
                      : tc("conditionsLockedNote"),
                  }
                : null
            }
          />

          <div className="grid items-start gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex flex-col gap-10">
              <section>
                <SectionHeader label={tc("aboutSection")} />
                <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-foreground">
                  {partner.description || tc("noDescription")}
                </p>
              </section>

              {partner.specializationDescription && (
                <section>
                  <SectionHeader label={tCompany("specializationLabel")} />
                  <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-muted-foreground">
                    {partner.specializationDescription}
                  </p>
                </section>
              )}

              {(worldwide || serviceCountryLabels.length > 0) && (
                <section>
                  <SectionHeader
                    label={tCompany("serviceCountriesLabel")}
                    count={worldwide ? undefined : serviceCountryLabels.length}
                  />
                  <div className="flex flex-wrap gap-2 pt-4">
                    {worldwide ? (
                      <span className="inline-flex h-8 items-center gap-2 rounded border border-border px-3 text-[12.5px] text-foreground">
                        <span aria-hidden>🌍</span>
                        {tCompany("worldwideLabel")}
                      </span>
                    ) : (
                      serviceCountryLabels.map((c) => (
                        <span
                          key={c.code}
                          className="inline-flex h-8 items-center gap-2 rounded border border-border px-3 text-[12.5px] text-foreground"
                        >
                          {c.flag && <span aria-hidden>{c.flag}</span>}
                          {c.name}
                        </span>
                      ))
                    )}
                  </div>
                </section>
              )}

              {galleryImages.length > 0 && (
                <section>
                  <SectionHeader label={tc("gallerySection")} />
                  <div className="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-3">
                    {galleryImages.map((image) => (
                      // eslint-disable-next-line @next/next/no-img-element -- own-origin, already re-encoded bytes (ADR 0022)
                      <img
                        key={image.id}
                        src={`/api/company-image/${image.id}`}
                        alt=""
                        loading="lazy"
                        className="aspect-[4/3] w-full rounded-md border border-border object-cover"
                      />
                    ))}
                  </div>
                </section>
              )}

              <section>
                <SectionHeader label={tc("howToSection")} />
                <HowToSteps steps={howToSteps} />
              </section>
            </div>

            <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
              <PartnerBusinessData
                title={tc("businessDataSection")}
                rows={businessDataRows}
              />

              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {tc("contactSection")}
                </p>

                <ul className="mt-4 space-y-2">
                  {partner.website && (
                    <li className="rounded-md border border-border bg-background px-4 py-3 text-sm">
                      <a
                        href={partner.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-3 transition-colors hover:text-accent-ink"
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
                        <li className="rounded-md border border-border bg-background px-4 py-3 text-sm">
                          <a
                            href={`mailto:${partner.contactEmail}`}
                            className="flex min-w-0 items-center gap-3 transition-colors hover:text-accent-ink"
                          >
                            <Mail
                              className="size-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span className="truncate">
                              {partner.contactEmail}
                            </span>
                          </a>
                        </li>
                      )}
                      {partner.contactPhone && (
                        <li className="rounded-md border border-border bg-background px-4 py-3 text-sm">
                          <a
                            href={`tel:${partner.contactPhone}`}
                            className="flex items-center gap-3 transition-colors hover:text-accent-ink"
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
                    <li className="rounded-md border border-border bg-background p-4 text-sm leading-6 text-muted-foreground">
                      {tc("contactsMembersOnly")}
                    </li>
                  )}
                </ul>

                {isResident && partner.contactEmail && (
                  <Button
                    asChild
                    className="mt-4 h-10 w-full rounded-md bg-accent text-xs font-bold uppercase tracking-[0.16em] text-accent-foreground hover:bg-[#b17944]"
                  >
                    <a href={`mailto:${partner.contactEmail}`}>
                      {tc("writeAction")}
                    </a>
                  </Button>
                )}

                {!isResident && (
                  <div className="mt-4 space-y-3 border-t border-border pt-4">
                    <p className="text-sm leading-6 text-muted-foreground">
                      {tc("joinPrompt")}
                    </p>
                    <Button
                      asChild
                      className="h-10 w-full rounded-md bg-accent text-xs font-bold uppercase tracking-[0.16em] text-accent-foreground hover:bg-[#b17944]"
                    >
                      <Link href={`/${locale}/login`}>{tc("joinCta")}</Link>
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex gap-3 rounded-xl border border-border bg-card p-5">
                <ShieldCheck
                  className="mt-0.5 size-4 shrink-0 text-[var(--success)]"
                  aria-hidden="true"
                />
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] text-foreground">
                    {tc("verifiedBoxTitle")}
                  </span>
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    {tc("verifiedBoxNote")}
                  </span>
                </div>
              </div>

              {isResident && (
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    <BadgeCheck
                      className="size-4 text-accent-ink"
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

                  {canSendReferral && (
                    <div className="mt-4 border-t border-border pt-4">
                      <SendReferralDialog
                        recipientCompanyId={partner.id}
                        translations={referralTranslations}
                      />
                    </div>
                  )}
                </div>
              )}
            </aside>
          </div>

          {similar.length > 0 && (
            <section className="pb-8">
              <div className="flex items-baseline justify-between gap-4 border-b border-border pb-6">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    {tc("similarEyebrow")}
                  </span>
                  <h2 className="mt-2 font-serif text-2xl font-bold tracking-tight">
                    {tc("similarTitle")}
                  </h2>
                </div>
                <Link
                  href={`/${locale}/directory`}
                  className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold transition-colors hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                >
                  {tc("openCatalogue")}
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </Link>
              </div>

              <div className="grid gap-6 pt-8 sm:grid-cols-2 lg:grid-cols-3">
                {similar.map((peer) => (
                  <PartnerCard
                    key={peer.id}
                    partner={peer}
                    href={`/${locale}/directory/${peer.slug}`}
                    view="grid"
                    noDescription={tc("noDescription")}
                    detailsLabel={tc("details")}
                    verifiedLabel={tc("verifiedPartner")}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
