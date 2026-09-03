"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { loginAction, verifyTotpAction } from "@/actions/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/auth/password-input";
import { PhoneField } from "@/components/auth/phone-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QRCodeSVG } from "qrcode.react";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="h-12 w-full rounded-none bg-accent text-xs font-black uppercase tracking-[0.16em] text-accent-foreground hover:bg-[#b49126]"
      disabled={pending}
    >
      {pending ? "..." : label}
    </Button>
  );
}

export function LoginForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();

  type LoginState = {
    success: boolean;
    error?: string;
    requiresTotp?: boolean;
    setupTotp?: boolean;
    totpUri?: string;
  };

  const [loginState, loginFormAction] = useActionState(
    async (_prevState: LoginState, formData: FormData) => {
      const result = await loginAction(formData);
      return result;
    },
    { success: false },
  );

  const [totpState, totpFormAction] = useActionState(
    async (
      _prevState: { success: boolean; error?: string },
      formData: FormData,
    ) => {
      const result = await verifyTotpAction(formData);
      return result;
    },
    { success: false },
  );

  useEffect(() => {
    // If login is fully successful and doesn't require TOTP, go to dashboard
    if (loginState.success && !loginState.requiresTotp) {
      router.push(`/${locale}/dashboard/profile`);
    }
    // If TOTP verification is successful, go to dashboard
    if (totpState.success) {
      router.push(`/${locale}/dashboard/profile`);
    }
  }, [
    loginState.success,
    loginState.requiresTotp,
    totpState.success,
    locale,
    router,
  ]);

  if (loginState.requiresTotp) {
    const totpTitle = loginState.setupTotp
      ? t("totpSetupTitle")
      : t("totpTitle");
    const totpSubtitle = loginState.setupTotp
      ? t("totpSetupSubtitle")
      : t("totpSubtitle");

    return (
      <AuthShell
        eyebrow={t("accessEyebrow")}
        title={totpTitle}
        subtitle={totpSubtitle}
      >
        <Card className="w-full rounded-none border-white/10 bg-background text-foreground shadow-none">
          <CardHeader className="space-y-3 border-b border-border p-6 sm:p-8">
            <CardTitle className="text-3xl font-black uppercase leading-none tracking-[-0.02em] text-foreground">
              {totpTitle}
            </CardTitle>
            <CardDescription className="text-sm font-light leading-6 text-muted-foreground">
              {totpSubtitle}
            </CardDescription>
          </CardHeader>
          <form action={totpFormAction}>
            <CardContent className="space-y-5 p-6 sm:p-8">
              {loginState.setupTotp && loginState.totpUri && (
                <div className="mb-4 flex justify-center border border-border bg-white p-4">
                  <QRCodeSVG value={loginState.totpUri} size={200} />
                </div>
              )}
              <div className="space-y-2 text-left">
                <Label htmlFor="code">{t("totpCodeLabel")}</Label>
                <Input
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="123456"
                  required
                  className="h-12 rounded-none bg-background text-center text-lg tracking-widest"
                />
              </div>
              {totpState?.error && (
                <div className="border border-destructive/30 bg-destructive/10 p-3 text-center text-sm font-medium text-destructive">
                  {totpState.error}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-col space-y-4 p-6 pt-0 sm:p-8 sm:pt-0">
              <SubmitButton label={t("totpVerify")} />
              <div className="text-sm text-center text-muted-foreground">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="font-bold uppercase tracking-[0.12em] text-foreground hover:text-accent-ink"
                >
                  {t("totpCancel")}
                </button>
              </div>
            </CardFooter>
          </form>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow={t("accessEyebrow")}
      title={t("loginTitle")}
      subtitle={t("loginSubtitle")}
    >
      <Card className="w-full rounded-none border-white/10 bg-background text-foreground shadow-none">
        <CardHeader className="space-y-3 border-b border-border p-6 sm:p-8">
          <CardTitle className="text-3xl font-black uppercase leading-none tracking-[-0.02em] text-foreground">
            {t("loginTitle")}
          </CardTitle>
          <CardDescription className="text-sm font-light leading-6 text-muted-foreground">
            {t("loginSubtitle")}
          </CardDescription>
        </CardHeader>
        <form action={loginFormAction}>
          <CardContent className="space-y-5 p-6 sm:p-8">
            <PhoneField
              id="phone"
              name="phone"
              label={t("phoneLabel")}
              autoComplete="username"
              required
              className="h-12 bg-background"
            />
            <div className="space-y-2 text-left">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t("passwordLabel")}</Label>
                <span className="text-xs text-muted-foreground opacity-50 cursor-not-allowed">
                  {t("forgotPassword")}
                </span>
              </div>
              <PasswordInput
                id="password"
                name="password"
                placeholder={t("passwordPlaceholder")}
                required
                showLabel={t("showPassword")}
                hideLabel={t("hidePassword")}
                className="h-12 rounded-none bg-background"
              />
            </div>
            {loginState?.error && (
              <div className="border border-destructive/30 bg-destructive/10 p-3 text-center text-sm font-medium text-destructive">
                {loginState.error}
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col space-y-4 p-6 pt-0 sm:p-8 sm:pt-0">
            <SubmitButton label={t("loginButton")} />
            <div className="text-sm text-center text-muted-foreground">
              {t("noAccount")}{" "}
              <Link
                href={`/${locale}/register`}
                className="font-bold text-foreground hover:text-accent-ink"
              >
                {t("registerLink")}
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </AuthShell>
  );
}
