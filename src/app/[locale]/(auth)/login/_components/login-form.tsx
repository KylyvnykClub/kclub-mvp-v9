"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { loginAction, verifyTotpAction } from "@/actions/auth";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QRCodeSVG } from "qrcode.react";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
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
    totpSecret?: string;
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
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)] px-4 py-12">
        <Card className="w-full max-w-md bg-card border-border shadow-2xl">
          <CardHeader className="space-y-2 text-center pt-8">
            <CardTitle className="text-[24px] font-bold tracking-tight text-white uppercase">
              {loginState.setupTotp ? "Set Up 2FA" : "Two-Factor Auth"}
            </CardTitle>
            <CardDescription className="text-[14px] text-[#888]">
              {loginState.setupTotp
                ? "Scan this QR code with your authenticator app"
                : "Enter the code from your authenticator app"}
            </CardDescription>
          </CardHeader>
          <form action={totpFormAction}>
            <CardContent className="space-y-4">
              {loginState.setupTotp && loginState.totpUri && (
                <div className="flex justify-center p-4 bg-white rounded-md mb-4">
                  <QRCodeSVG value={loginState.totpUri} size={200} />
                  <input
                    type="hidden"
                    name="newSecret"
                    value={loginState.totpSecret}
                  />
                </div>
              )}
              <div className="space-y-2 text-left">
                <Label htmlFor="code">Authenticator Code</Label>
                <Input
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="123456"
                  required
                  className="bg-background/50 text-center tracking-widest text-lg"
                />
              </div>
              {totpState?.error && (
                <div className="text-sm font-medium text-destructive text-center">
                  {totpState.error}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <SubmitButton label="Verify" />
              <div className="text-sm text-center text-muted-foreground">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="text-primary hover:underline underline-offset-4"
                >
                  Cancel
                </button>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center min-h-[calc(100vh-200px)] px-4 py-12">
      <Card className="w-full max-w-md bg-card border-border shadow-2xl">
        <CardHeader className="space-y-2 text-center pt-8">
          <CardTitle className="text-[24px] font-bold tracking-tight text-white uppercase">
            {t("loginTitle")}
          </CardTitle>
          <CardDescription className="text-[14px] text-[#888]">
            {t("loginSubtitle")}
          </CardDescription>
        </CardHeader>
        <form action={loginFormAction}>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-left">
              <Label htmlFor="phone">{t("phoneLabel")}</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder={t("phonePlaceholder")}
                required
                className="bg-background/50"
              />
            </div>
            <div className="space-y-2 text-left">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t("passwordLabel")}</Label>
                <span className="text-xs text-muted-foreground opacity-50 cursor-not-allowed">
                  {t("forgotPassword")}
                </span>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder={t("passwordPlaceholder")}
                required
                className="bg-background/50"
              />
            </div>
            {loginState?.error && (
              <div className="text-sm font-medium text-destructive text-center">
                {loginState.error}
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <SubmitButton label={t("loginButton")} />
            <div className="text-sm text-center text-muted-foreground">
              {t("noAccount")}{" "}
              <Link
                href={`/${locale}/register`}
                className="text-primary hover:underline underline-offset-4"
              >
                {t("registerLink")}
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
