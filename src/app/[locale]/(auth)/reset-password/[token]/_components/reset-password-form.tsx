"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";

import {
  completePasswordResetAction,
  type ResetCompleteState,
} from "@/actions/password-reset";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const initialState: ResetCompleteState = { status: "idle" };

/**
 * Setting a new password against a reset link (FR-006).
 *
 * The link is spent by submitting this form, not by opening the page: a token
 * checked on load would be burned by a mail scanner, and would answer "is this
 * link real?" for free.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [state, formAction] = useActionState(
    completePasswordResetAction,
    initialState,
  );

  if (state.status === "done") {
    return (
      <AuthShell
        eyebrow={t("accessEyebrow")}
        title={t("resetDoneTitle")}
        subtitle={t("resetDoneSubtitle")}
      >
        <AuthCard
          title={t("resetDoneTitle")}
          description={t("resetDoneSubtitle")}
        >
          <Button asChild className="w-full">
            <Link href={`/${locale}/login`}>{t("backToSignIn")}</Link>
          </Button>
        </AuthCard>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow={t("accessEyebrow")}
      title={t("resetTitle")}
      subtitle={t("resetSubtitle")}
    >
      <AuthCard title={t("resetTitle")} description={t("resetSubtitle")}>
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="token" value={token} />

          <div className="space-y-2">
            <Label htmlFor="password">{t("resetNewPassword")}</Label>
            <PasswordInput
              id="password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              showLabel={t("showPassword")}
              hideLabel={t("hidePassword")}
              className="h-12 bg-background"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t("resetConfirmPassword")}</Label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              required
              minLength={8}
              autoComplete="new-password"
              showLabel={t("showPassword")}
              hideLabel={t("hidePassword")}
              className="h-12 bg-background"
            />
          </div>

          <p className="text-xs text-muted-foreground">{t("resetNotice")}</p>

          {state.status !== "idle" && (
            <p className="text-sm text-destructive" role="status">
              {t(`resetError.${state.status}`)}
            </p>
          )}

          <Submit label={t("resetSubmit")} />

          <div className="text-center text-sm text-muted-foreground">
            <Link
              href={`/${locale}/forgot-password`}
              className="font-bold text-foreground hover:text-accent-ink"
            >
              {t("resetAskAgain")}
            </Link>
          </div>
        </form>
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
