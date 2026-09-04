import { setRequestLocale, getTranslations } from "next-intl/server";
import { googleEnabled } from "@/modules/identity/google";
import { LoginForm } from "./_components/login-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });

  return {
    title: t("loginTitle"),
  };
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Set by the Google callback when it refuses (ADR 0029). A code, not a
  // message: the message is chosen by the client in the member's language.
  const { error } = await searchParams;

  return <LoginForm google={googleEnabled()} providerError={error ?? null} />;
}
