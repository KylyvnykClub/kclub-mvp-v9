import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { CheckCircle } from "lucide-react";

/**
 * Checkout success page. This page is shown after a Stripe checkout redirect.
 * It deliberately grants NO entitlement — access is projected exclusively by
 * the webhook worker (ADR 0004, T-3.1). A direct visit to this URL has no
 * side effects.
 */
export default async function CheckoutSuccessPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("billing");

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="mx-auto max-w-md text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <CheckCircle className="mx-auto h-12 w-12 text-accent" />
        <h1 className="text-2xl font-bold">{t("successTitle")}</h1>
        <p className="text-muted-foreground">{t("successDescription")}</p>
        <Link
          href={`/${locale}/dashboard/profile`}
          className="inline-flex items-center justify-center rounded-md bg-accent px-6 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 transition-colors"
        >
          {t("backToProfile")}
        </Link>
      </div>
    </div>
  );
}
