import { getTranslations, setRequestLocale } from "next-intl/server";

import { VerifyEmailForm } from "./_components/verify-email-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });

  return {
    title: t("verifyEmailTitle"),
    // A verification link is a credential for as long as it is unspent. It has
    // no business in an index.
    robots: { index: false, follow: false },
  };
}

export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { token } = await searchParams;

  return <VerifyEmailForm token={token ?? ""} />;
}
