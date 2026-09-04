"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";

import { confirmEmailAction, type EmailConfirmState } from "@/actions/email";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";

const initialState: EmailConfirmState = { status: "idle" };

/**
 * The page a verification link lands on (ADR 0028).
 *
 * The link does not spend itself. Confirming is a button, because mail
 * clients, corporate mail filters and link previewers all follow URLs in
 * messages, and a one-time token spent by a scanner leaves the member holding
 * a link that no longer works and no explanation of why.
 */
export function VerifyEmailForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [state, formAction] = useActionState(confirmEmailAction, initialState);

  const body =
    state.status === "confirmed" ? (
      <div className="space-y-5">
        <p className="text-sm text-white/70">{t("verifyEmailDone")}</p>
        <Button asChild className="w-full">
          <Link href={`/${locale}/dashboard/profile`}>
            {t("verifyEmailContinue")}
          </Link>
        </Button>
      </div>
    ) : (
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="token" value={token} />
        <Submit label={t("verifyEmailConfirm")} />
        {state.status === "invalid" && (
          <p className="text-sm text-destructive">{t("verifyEmailInvalid")}</p>
        )}
      </form>
    );

  return (
    <AuthShell
      eyebrow={t("accessEyebrow")}
      title={t("verifyEmailTitle")}
      subtitle={t("verifyEmailSubtitle")}
    >
      {body}
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
