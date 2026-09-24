"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";

import {
  requestPasswordResetAction,
  type ResetRequestState,
} from "@/actions/password-reset";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthShell } from "@/components/auth/auth-shell";
import { IdentifierField } from "@/components/auth/identifier-field";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { nextChallengeNonce } from "@/components/auth/turnstile-nonce";
import { Button } from "@/components/ui/button";

const initialState: ResetRequestState = { status: "idle" };

/**
 * Asking for a password reset (FR-006, ADR 0032).
 *
 * The answer is the same whether or not the account exists, whether or not it
 * holds an address, and whether or not that address is proved — which also
 * means it does not say whether a link was emailed or a request was put in
 * front of staff. One sentence covers both, and it is true in both. This is
 * the one form an anonymous caller can put any identifier into; a reply that
 * varied would make it a membership oracle (security.md §6, ADR 0005).
 */
export function ForgotPasswordForm({
  turnstileSiteKey,
}: {
  turnstileSiteKey: string | null;
}) {
  const t = useTranslations("auth");
  const locale = useLocale();
  // The token this form posts is single-use, so a refusal leaves a spent one
  // in the hidden input and every retry after it fails for the challenge
  // rather than for the identifier. Bumped on refusal to replace it.
  const [challengeNonce, setChallengeNonce] = useState(0);

  const [state, formAction] = useActionState(
    async (_prev: ResetRequestState | null, formData: FormData) => {
      // Cloudflare injects this input next to the widget inside the form.
      const token = formData.get("cf-turnstile-response");
      if (typeof token === "string") formData.append("turnstileToken", token);

      const result = await requestPasswordResetAction(_prev, formData);

      setChallengeNonce((n) =>
        nextChallengeNonce(n, { success: result.status === "sent" }),
      );

      return result;
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
            {/* The same control sign-in uses, for the same reason: whichever
                identifier brought the member in should bring them back. */}
            <IdentifierField />

            <p className="text-xs text-muted-foreground">{t("forgotHelp")}</p>

            <TurnstileWidget
              siteKey={turnstileSiteKey}
              locale={locale}
              nonce={challengeNonce}
            />

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
