import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getCurrentMember } from "@/actions/session";
import { db } from "@/data/db";
import { listCompaniesByOwner } from "@/data/companies";
import { env } from "@/env";
import { getLegalDocument } from "@/lib/mdx";
import { monthlyPrice } from "@/domain/pricing";
import { PartnerApplicationForm } from "./_components/partner-application-form";

/**
 * Business partner registration (FR-109).
 *
 * The destination of the "Business" card on the landing page. It used to point
 * at `/register`, which is the member sign-up: a business that clicked it was
 * asked for a display name and a country, paid $4.99 to join a club it had not
 * asked to join, and only then — three screens later, behind a dues gate — met
 * the form it came for.
 *
 * Outside `(dashboard)` on purpose, for the same reason the dues screen is: a
 * business filing an application is not inside the club yet, and the gate that
 * protects the club would otherwise keep them from the form that gets them in.
 *
 * Three ways to arrive, three answers:
 * - signed out — the whole thing, account and application, on one page;
 * - a partner whose account exists but whose application does not — the
 *   application half, so a half-finished registration can be finished;
 * - anybody else who is signed in — the dashboard's own form, which is the
 *   same questions with a draft behind them.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "partnerApply" });
  return { title: t("title"), description: t("subtitle") };
}

export default async function PartnerApplicationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const current = await getCurrentMember();

  if (current?.member) {
    if (current.member.duesKind !== "partner") {
      redirect(`/${locale}/dashboard/company/new`);
    }

    const companies = await listCompaniesByOwner(db, current.member.id);
    if (companies.length > 0) {
      // Their application exists; the standing screen is where its outcome and
      // its payment live (FR-110, FR-111).
      redirect(`/${locale}/membership`);
    }
  }

  const [terms, privacy] = await Promise.all([
    getLegalDocument("terms-of-use", locale),
    getLegalDocument("privacy-policy", locale),
  ]);

  return (
    <PartnerApplicationForm
      signedIn={Boolean(current?.member)}
      termsVersion={terms?.version ?? null}
      privacyVersion={privacy?.version ?? null}
      turnstileSiteKey={env.client.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null}
      listingPrice={monthlyPrice("listing", locale)}
    />
  );
}
