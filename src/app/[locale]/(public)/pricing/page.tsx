import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getCurrentMember } from "@/actions/session";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { db } from "@/data/db";
import { listCompaniesByOwner } from "@/data/companies";
import { loadMembershipAccess } from "@/data/membership-access";
import { buildActor, staffAtLeast } from "@/domain/actor";
import {
  MONTHLY_PRICE_MINOR,
  formatPrice,
  pricingDestinations,
} from "@/domain/pricing";
import { localeAlternates } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pricing" });

  return {
    title: t("title"),
    description: t("subtitle"),
    alternates: localeAlternates("/pricing", locale),
  };
}

/**
 * What the club costs, in public (ADR 0033).
 *
 * Public rather than a tab inside the member area: its job is to answer the
 * question somebody asks *before* they register, and a page only members can
 * read cannot do that. The member area links here from the dues screen rather
 * than keeping a second copy of the same three prices.
 *
 * Amounts come from `src/domain/pricing.ts` — one table, three languages, no
 * price written into a translation string.
 */
export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "pricing" });
  const current = await getCurrentMember();
  const actor = current?.member ? buildActor(current.member) : null;

  // Where each button leads depends on whether this reader is in the club
  // yet; the rule itself is `pricingDestinations`, tested on its own. Staff
  // are never gated (ADR 0007), so they read as paid.
  const member = current?.member;
  const [access, owned] =
    member && !(actor && staffAtLeast(actor, "staff_support"))
      ? await Promise.all([
          loadMembershipAccess(db, member, new Date()),
          listCompaniesByOwner(db, member.id),
        ])
      : [null, []];
  const href = pricingDestinations(
    member
      ? {
          signedIn: true,
          awaitingPayment: access === "awaiting_payment",
          ownsCompany: owned.length > 0,
        }
      : { signedIn: false },
    locale,
  );

  const plans = [
    {
      key: "membership" as const,
      name: t("membershipName"),
      description: t("membershipDescription"),
      cta: t("membershipCta"),
      href: href.membership,
      featured: true,
    },
    {
      key: "vip" as const,
      name: t("vipName"),
      description: t("vipDescription"),
      cta: t("vipCta"),
      href: href.vip,
      featured: false,
    },
    {
      key: "listing" as const,
      name: t("listingName"),
      description: t("listingDescription"),
      cta: t("listingCta"),
      href: href.listing,
      featured: false,
    },
  ];

  return (
    <>
      <SiteHeader
        member={Boolean(current?.member)}
        admin={actor ? staffAtLeast(actor, "staff_support") : false}
      />
      <main className="border-b border-border bg-background">
        <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
          <h1 className="text-4xl font-black uppercase leading-none tracking-[-0.02em] text-foreground sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-4 max-w-2xl text-base font-light leading-7 text-muted-foreground">
            {t("subtitle")}
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.key}
                className={`flex flex-col border p-6 ${
                  plan.featured
                    ? "border-accent bg-accent/5"
                    : "border-border bg-background"
                }`}
              >
                <h2 className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
                  {plan.name}
                </h2>
                <p className="mt-4 flex items-baseline gap-2">
                  <span className="text-4xl font-black tracking-[-0.02em] text-foreground">
                    {formatPrice(MONTHLY_PRICE_MINOR[plan.key], locale)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t("perMonth")}
                  </span>
                </p>
                <p className="mt-4 flex-1 text-sm font-light leading-6 text-muted-foreground">
                  {plan.description}
                </p>
                <Link
                  href={plan.href}
                  className={`mt-6 flex h-12 items-center justify-center text-xs font-black uppercase tracking-[0.16em] ${
                    plan.featured
                      ? "bg-accent text-accent-foreground hover:bg-[#b49126]"
                      : "border border-border text-foreground hover:border-foreground"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-12 border-t border-border pt-8">
            <h2 className="text-sm font-black uppercase tracking-[0.16em] text-foreground">
              {t("sponsoredTitle")}
            </h2>
            <p className="mt-3 max-w-2xl text-sm font-light leading-6 text-muted-foreground">
              {t("sponsoredBody")}
            </p>
            <p className="mt-6 text-xs text-muted-foreground">
              {t("currencyNote")}
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
