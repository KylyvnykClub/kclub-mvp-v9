import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getCurrentMember } from "@/actions/session";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { db } from "@/data/db";
import {
  loadMembershipAccess,
  memberCanBecomePartner,
} from "@/data/membership-access";
import { buildActor, staffAtLeast } from "@/domain/actor";
import { MONTHLY_PRICE_MINOR, formatPrice } from "@/domain/pricing";
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

  // Where each button leads depends on whether this member is in the club
  // yet. An unpaid member used to be sent to dashboard pages, which the dues
  // gate turned into the $4.99 screen - whichever plan they had picked.
  const unpaid =
    current?.member && !(actor && staffAtLeast(actor, "staff_support"))
      ? (await loadMembershipAccess(db, current.member, new Date())) ===
        "awaiting_payment"
      : false;
  const mayApplyAsBusiness =
    unpaid && current?.member
      ? current.member.duesKind === "partner" ||
        (await memberCanBecomePartner(db, current.member.id))
      : false;

  const plans = [
    {
      key: "membership" as const,
      name: t("membershipName"),
      description: t("membershipDescription"),
      cta: t("membershipCta"),
      href: current?.member ? `/${locale}/membership` : `/${locale}/register`,
      featured: true,
    },
    {
      key: "vip" as const,
      name: t("vipName"),
      description: t("vipDescription"),
      cta: t("vipCta"),
      // VIP is added on top of membership (ADR 0033): an unpaid member starts
      // with the dues screen, which says so; a paid one adds it in Billing.
      href: !current?.member
        ? `/${locale}/register`
        : unpaid
          ? `/${locale}/membership`
          : `/${locale}/dashboard/profile?tab=billing`,
      featured: false,
    },
    {
      key: "listing" as const,
      name: t("listingName"),
      description: t("listingDescription"),
      cta: t("listingCta"),
      // The listing is a business's plan, so a signed-out reader goes to the
      // partner application and not to member sign-up (FR-109). A member who
      // is already in the club submits from the dashboard, which is where
      // their draft lives.
      //
      // A member who registered but never paid applies as a business on
      // /partner, where the listing - not the dues - is what they pay for.
      href: !current?.member
        ? `/${locale}/partner`
        : mayApplyAsBusiness
          ? `/${locale}/partner`
          : `/${locale}/dashboard/company/new`,
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
