"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { requestPhoneVerificationAction, registerAction } from "@/actions/auth";
import { AGE_ATTESTATION_VERSION } from "@/lib/legal-consents";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

function SubmitButton({
  label,
  pendingLabel,
  disabled,
}: {
  label: string;
  pendingLabel?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
      disabled={pending || disabled}
    >
      {pending ? pendingLabel || "..." : label}
    </Button>
  );
}

type AuthActionResult = {
  success: boolean;
  error?: string;
  sent?: boolean;
} | null;

export function RegisterFlow({
  termsVersion,
  privacyVersion,
}: {
  termsVersion: string | null;
  privacyVersion: string | null;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("register");
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");

  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});

  const consents = useMemo(() => {
    return [
      {
        documentId: "terms-of-use" as const,
        version: termsVersion ?? "",
        key: "terms",
      },
      {
        documentId: "privacy-policy" as const,
        version: privacyVersion ?? "",
        key: "privacy",
      },
      {
        documentId: "arbitration" as const,
        version: termsVersion ?? "",
        key: "arbitration",
      },
      {
        documentId: "age-verification" as const,
        version: AGE_ATTESTATION_VERSION,
        key: "age",
      },
    ];
  }, [termsVersion, privacyVersion]);

  const allAccepted =
    termsVersion !== null &&
    privacyVersion !== null &&
    consents.every((c) => accepted[c.key]);

  const [phoneState, submitPhone] = useActionState(
    async (_prevState: AuthActionResult, formData: FormData) => {
      const p = formData.get("phone") as string;
      const res = await requestPhoneVerificationAction(formData);
      if (res?.success) {
        setPhone(p);
        setStep(2);
      }
      return res;
    },
    null,
  );

  const [registerState, submitRegister] = useActionState(
    async (_prevState: AuthActionResult, formData: FormData) => {
      formData.append("phone", phone);
      formData.append("code", code);
      formData.append(
        "consents",
        JSON.stringify(
          consents
            .filter((c) => accepted[c.key])
            .map(({ documentId, version }) => ({ documentId, version })),
        ),
      );
      const res = await registerAction(formData);
      if (res?.success) {
        router.push(`/${locale}/dashboard/profile`);
      }
      return res;
    },
    null,
  );

  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6) {
      setStep(3);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md bg-card border-border shadow-2xl">
        <CardHeader className="space-y-4 pt-8">
          <div className="flex justify-center space-x-2 mb-4">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-2 w-2 rounded-full transition-colors ${
                  step === s ? "bg-accent" : "bg-muted"
                }`}
                aria-hidden="true"
              />
            ))}
          </div>
          <CardTitle className="text-[24px] font-bold tracking-tight text-white uppercase text-center">
            {step === 1 && t("step1Title")}
            {step === 2 && t("step2Title")}
            {step === 3 && t("step3Title")}
          </CardTitle>
          <CardDescription className="text-center text-[14px] text-[#888]">
            {step === 1 && t("step1Subtitle")}
            {step === 2 && t("step2Subtitle")}
            {step === 3 && t("step3Subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 && (
            <form
              action={submitPhone}
              className="space-y-4 animate-in fade-in zoom-in-95 duration-300"
            >
              <div className="space-y-2">
                <Label htmlFor="phone">{tAuth("phoneLabel")}</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  placeholder={tAuth("phonePlaceholder")}
                  defaultValue={phone}
                />
              </div>
              {phoneState?.error && (
                <p className="text-sm text-destructive">{phoneState.error}</p>
              )}
              <SubmitButton label={tAuth("sendCode")} />
            </form>
          )}

          {step === 2 && (
            <form
              onSubmit={handleVerifyCode}
              className="space-y-4 animate-in fade-in zoom-in-95 duration-300"
            >
              <div className="text-sm text-center text-muted-foreground mb-4">
                {tAuth("codeSent", { phone })}
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">{tAuth("codeLabel")}</Label>
                <Input
                  id="code"
                  type="text"
                  required
                  maxLength={6}
                  placeholder={tAuth("codePlaceholder")}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                disabled={code.length !== 6}
              >
                {tAuth("verifyCode")}
              </Button>
              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-sm text-muted-foreground hover:text-foreground underline"
                >
                  {tCommon("back")}
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <form
              action={submitRegister}
              className="space-y-4 animate-in fade-in zoom-in-95 duration-300"
            >
              <div className="space-y-2">
                <Label htmlFor="displayName">{t("nameLabel")}</Label>
                <Input
                  id="displayName"
                  name="displayName"
                  required
                  placeholder={t("namePlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{tAuth("passwordLabel")}</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  placeholder={tAuth("passwordPlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">
                  {t("passwordConfirmLabel")}
                </Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="country">{t("countryLabel")}</Label>
                <Select name="country" required>
                  <SelectTrigger id="country">
                    <SelectValue placeholder={t("countryLabel")} />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "UA",
                      "PL",
                      "DE",
                      "US",
                      "GB",
                      "CZ",
                      "FR",
                      "IT",
                      "ES",
                      "PT",
                    ].map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(`countries.${c}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="language">{t("languageLabel")}</Label>
                <Select name="language" required defaultValue={locale}>
                  <SelectTrigger id="language">
                    <SelectValue placeholder={t("languageLabel")} />
                  </SelectTrigger>
                  <SelectContent>
                    {["en", "uk", "ru"].map((l) => (
                      <SelectItem key={l} value={l}>
                        {t(`languages.${l}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4 pt-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="consent-terms"
                    checked={!!accepted.terms}
                    onCheckedChange={(c) =>
                      setAccepted((p) => ({ ...p, terms: c === true }))
                    }
                  />
                  <Label
                    htmlFor="consent-terms"
                    className="text-sm font-normal"
                  >
                    {t.rich("termsLabel", {
                      terms: (chunks) => (
                        <Link
                          href={`/${locale}/legal/terms-of-use`}
                          className="underline hover:text-primary"
                        >
                          {chunks}
                        </Link>
                      ),
                    })}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="consent-privacy"
                    checked={!!accepted.privacy}
                    onCheckedChange={(c) =>
                      setAccepted((p) => ({ ...p, privacy: c === true }))
                    }
                  />
                  <Label
                    htmlFor="consent-privacy"
                    className="text-sm font-normal"
                  >
                    {t.rich("privacyLabel", {
                      privacy: (chunks) => (
                        <Link
                          href={`/${locale}/legal/privacy-policy`}
                          className="underline hover:text-primary"
                        >
                          {chunks}
                        </Link>
                      ),
                    })}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="consent-arbitration"
                    checked={!!accepted.arbitration}
                    onCheckedChange={(c) =>
                      setAccepted((p) => ({ ...p, arbitration: c === true }))
                    }
                  />
                  <Label
                    htmlFor="consent-arbitration"
                    className="text-sm font-normal"
                  >
                    {t.rich("arbitrationLabel", {
                      terms: (chunks) => (
                        <Link
                          href={`/${locale}/legal/terms-of-use`}
                          className="underline hover:text-primary"
                        >
                          {chunks}
                        </Link>
                      ),
                    })}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="consent-age"
                    checked={!!accepted.age}
                    onCheckedChange={(c) =>
                      setAccepted((p) => ({ ...p, age: c === true }))
                    }
                  />
                  <Label htmlFor="consent-age" className="text-sm font-normal">
                    {t("ageLabel")}
                  </Label>
                </div>
              </div>

              {registerState?.error && (
                <p className="text-sm text-destructive">
                  {registerState.error}
                </p>
              )}

              <SubmitButton
                label={t("createAccount")}
                disabled={!allAccepted}
              />
            </form>
          )}
        </CardContent>
        <CardFooter className="justify-center pt-2 pb-6">
          <p className="text-sm text-muted-foreground">
            {t("haveAccount")}{" "}
            <Link
              href={`/${locale}/login`}
              className="text-primary hover:underline"
            >
              {t("loginLink")}
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
