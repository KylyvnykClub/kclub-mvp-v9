"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { loginAction } from "@/actions/auth";
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

  const [state, formAction, isPending] = useActionState(
    async (_prevState: { success: boolean; error?: string }, formData: FormData) => {
      const result = await loginAction(formData);
      return result;
    },
    { success: false, error: undefined as string | undefined },
  );

  useEffect(() => {
    if (state.success) {
      router.push(`/${locale}/dashboard/profile`);
    }
  }, [state.success, locale, router]);

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
        <form action={formAction}>
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
            {state?.error && (
              <div className="text-sm font-medium text-destructive text-center">
                {state.error}
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
