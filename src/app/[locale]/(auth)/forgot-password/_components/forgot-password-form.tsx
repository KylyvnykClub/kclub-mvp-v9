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
import { PhoneField } from "@/components/auth/phone-input";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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
  const [identifier, setIdentifier] = useState<"phone" | "email">("email");

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
            <div
              role="group"
              aria-label={t("identifierLabel")}
              className="grid grid-cols-2 gap-1 rounded-md border border-input p-1"
            >
              {(["email", "phone"] as const).map((kind) => (
                <button
                  type="button"
                  key={kind}
                  onClick={() => setIdentifier(kind)}
                  aria-pressed={identifier === kind}
                  className={cn(
                    "rounded-sm px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] transition-colors",
                    identifier === kind
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {kind === "email"
                    ? t("identifierEmail")
                    : t("identifierPhone")}
                </button>
              ))}
            </div>

            {identifier === "email" ? (
              <div className="space-y-2">
                <Label htmlFor="email">{t("emailLabel")}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  required
                  maxLength={255}
                  className="h-12 bg-background"
                />
              </div>
            ) : (
              <PhoneField
                id="phone"
                name="phone"
                label={t("phoneLabel")}
                autoComplete="username"
                required
                className="h-12 bg-background"
              />
            )}

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
