import { cookies } from "next/headers";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getLegalDocument } from "@/lib/mdx";
import { env } from "@/env";
import {
  PENDING_IDENTITY_COOKIE,
  openPendingIdentity,
} from "@/lib/pending-identity";
import { googleEnabled } from "@/modules/identity/google";
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

  // Someone who arrived through Google has an address we already trust
  // (ADR 0029). The cookie is signed, so the form can show it as proved.
  const cookieStore = await cookies();
  const pending = openPendingIdentity(
    cookieStore.get(PENDING_IDENTITY_COOKIE)?.value,
    env.server.BETTER_AUTH_SECRET,
  );

  const [terms, privacy] = await Promise.all([
    getLegalDocument("terms-of-use", locale),
    getLegalDocument("privacy-policy", locale),
  ]);

  return (
    <RegisterFlow
      termsVersion={terms?.version ?? null}
      privacyVersion={privacy?.version ?? null}
      phoneVerificationEnabled={env.server.AUTH_PHONE_VERIFICATION_ENABLED}
      turnstileSiteKey={env.client.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null}
      google={googleEnabled()}
      googleEmail={pending?.email ?? null}
      googleName={pending?.displayName ?? null}
    />
  );
}
