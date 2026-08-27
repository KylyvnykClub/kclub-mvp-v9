import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { XCircle } from "lucide-react";

import { getCurrentMember } from "@/actions/session";
import { db } from "@/data/db";
import { findCompanyByOwner } from "@/data/companies";

/**
 * Checkout canceled page. Like its success counterpart it has no side effects:
 * abandoning Stripe changes nothing, and nothing has been charged.
 *
 * When a company id is present and belongs to the caller, the copy says what
 * actually happened - the application itself was saved on submission (ADR 0019)
 * and stays payable from Profile > Companies, so an abandoned checkout is not a
 * lost application.
 */
export default async function CheckoutCanceledPage({
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
        <XCircle className="mx-auto h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">{t("canceledTitle")}</h1>
        <p className="text-muted-foreground">
          {company
            ? t("listingCanceledDescription", { name: company.name })
            : t("canceledDescription")}
        </p>
        <Link
          href={`/${locale}/dashboard/profile`}
          className="inline-flex items-center justify-center rounded-md border border-border px-6 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          {t("backToProfile")}
        </Link>
      </div>
    </div>
  );
}
