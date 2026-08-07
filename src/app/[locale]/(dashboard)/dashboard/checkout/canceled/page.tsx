import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { XCircle } from "lucide-react";

export default async function CheckoutCanceledPage({
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
        <XCircle className="mx-auto h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">{t("canceledTitle")}</h1>
        <p className="text-muted-foreground">{t("canceledDescription")}</p>
        <Link
          href={`/${locale}/dashboard/profile`}
          className="inline-flex items-center justify-center rounded-md border border-border px-6 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          {t("backToProfile")}
        </Link>
      </div>
    </div>
  );
}
