import { setRequestLocale, getTranslations } from "next-intl/server";
import { getLegalDocument } from "@/lib/mdx";
import { RegisterFlow } from "./_components/register-flow";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: t("registerTitle") };
}

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [terms, privacy] = await Promise.all([
    getLegalDocument("terms-of-use", locale),
    getLegalDocument("privacy-policy", locale),
  ]);

  return (
    <RegisterFlow
      termsVersion={terms?.version ?? null}
      privacyVersion={privacy?.version ?? null}
    />
  );
}
