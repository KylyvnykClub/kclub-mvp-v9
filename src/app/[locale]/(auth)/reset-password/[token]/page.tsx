import { getTranslations, setRequestLocale } from "next-intl/server";

import { ResetPasswordForm } from "./_components/reset-password-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });

  return {
    title: t("resetTitle"),
    // The token is in the path, and it sets a password. It has no business in
    // an index or in a referrer.
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  // The token is not checked here. Telling a visitor on page load whether a
  // link is still good would answer that question without spending it, and the
  // answer is worth having to somebody who is guessing.
  return <ResetPasswordForm token={token} />;
}
