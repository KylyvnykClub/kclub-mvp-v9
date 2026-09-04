import { getTranslations, setRequestLocale } from "next-intl/server";

import { env } from "@/env";
import { ForgotPasswordForm } from "./_components/forgot-password-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });

  return { title: t("forgotTitle") };
}

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ForgotPasswordForm
      turnstileSiteKey={env.client.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null}
    />
  );
}
