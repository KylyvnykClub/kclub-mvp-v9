import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { CheckCircle } from "lucide-react";

import { getCurrentMember } from "@/actions/session";
import { db } from "@/data/db";
import { findCompanyByOwner } from "@/data/companies";

/**
 * Checkout success page. This page is shown after a Stripe checkout redirect.
 * It deliberately grants NO entitlement — access is projected exclusively by
 * the webhook worker (ADR 0004, T-3.1). A direct visit to this URL has no
 * side effects.
 *
 * The `company` query parameter selects which copy to show and nothing else.
 * It is verified against the session's own companies before it is used, so a
 * guessed id shows the generic wording rather than another owner's company
 * name. Since ADR 0019 a listing is paid for before moderation, so the message
 * here is "under review", not "published".
 */
export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ company?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("billing");

  const { company: companyId } = await searchParams;
  const auth = companyId ? await getCurrentMember() : null;
  const company =
    companyId && auth?.member
      ? await findCompanyByOwner(db, companyId, auth.member.id)
      : null;

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="mx-auto max-w-md space-y-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
        <CheckCircle className="mx-auto h-12 w-12 text-accent-ink" />
        <h1 className="text-2xl font-bold">
          {company ? t("listingSuccessTitle") : t("successTitle")}
        </h1>
        <p className="text-muted-foreground">
          {company
            ? t("listingUnderReview", { name: company.name })
            : t("successDescription")}
        </p>
        {company && (
          <p className="text-sm text-muted-foreground">
            {t("listingReviewNotice")}
          </p>
        )}
        <Link
          href={`/${locale}/dashboard/profile`}
          className="inline-flex items-center justify-center rounded-md bg-accent px-6 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90"
        >
          {t("backToProfile")}
        </Link>
      </div>
    </div>
  );
}
