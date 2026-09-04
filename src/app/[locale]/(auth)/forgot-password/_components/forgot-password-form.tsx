"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";

import {
  requestPasswordResetAction,
  type ResetRequestState,
} from "@/actions/password-reset";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthShell } from "@/components/auth/auth-shell";
import { PhoneField } from "@/components/auth/phone-input";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { Button } from "@/components/ui/button";

const initialState: ResetRequestState = { status: "idle" };

/**
 * Asking for a reset link (FR-006, ADR 0028).
 *
 * The answer is the same whether or not the account exists, and whether or not
 * it has an address on file. This is the one form an anonymous caller can put
 * any address into; a reply that varied would make it a membership oracle
 * (security.md §6, ADR 0005).
 */
export function ForgotPasswordForm({
  turnstileSiteKey,
}: {
  turnstileSiteKey: string | null;
}) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [state, formAction] = useActionState(
    async (_prev: ResetRequestState | null, formData: FormData) => {
      // Cloudflare injects this input next to the widget inside the form.
      const token = formData.get("cf-turnstile-response");
      if (typeof token === "string") formData.append("turnstileToken", token);

      return requestPasswordResetAction(_prev, formData);
    },
    initialState,
  );

  return (
    <AuthShell
      eyebrow={t("accessEyebrow")}
      title={t("forgotTitle")}
      subtitle={t("forgotSubtitle")}
    >
      <AuthCard title={t("forgotTitle")} description={t("forgotSubtitle")}>
        {state.status === "sent" ? (
          <div className="space-y-5">
            <p className="text-sm text-white/70">{t("forgotSent")}</p>
            <Button asChild className="w-full">
              <Link href={`/${locale}/login`}>{t("backToSignIn")}</Link>
            </Button>
          </div>
        ) : (
          <form action={formAction} className="space-y-5">
            {/* Phone only (ADR 0031): a member is identified by their
                number, and staff recognise them by it. */}
            <PhoneField
              id="phone"
              name="phone"
              label={t("phoneLabel")}
              autoComplete="username"
              required
              className="h-12 bg-background"
            />

            <p className="text-xs text-muted-foreground">{t("forgotHelp")}</p>

            <TurnstileWidget siteKey={turnstileSiteKey} locale={locale} />

            {state.status !== "idle" && (
              <p className="text-sm text-destructive" role="status">
                {t(`forgotError.${state.status}`)}
              </p>
            )}

            <Submit label={t("forgotSubmit")} />

            <div className="text-center text-sm text-muted-foreground">
              <Link
                href={`/${locale}/login`}
                className="font-bold text-foreground hover:text-accent-ink"
              >
                {t("backToSignIn")}
              </Link>
            </div>
          </form>
        )}
      </AuthCard>
    </AuthShell>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  const tCommon = useTranslations("common");

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? tCommon("loading") : label}
    </Button>
  );
}
