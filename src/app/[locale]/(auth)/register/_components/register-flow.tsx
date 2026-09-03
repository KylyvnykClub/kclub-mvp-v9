"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { requestPhoneVerificationAction, registerAction } from "@/actions/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { PhoneInput } from "@/components/auth/phone-input";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { CountrySelect } from "@/components/ui/country-select";
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
      className="h-12 w-full rounded-none bg-accent text-xs font-black uppercase tracking-[0.16em] text-accent-foreground hover:bg-[#b49126]"
      disabled={pending || disabled}
    >
      {pending ? pendingLabel || "..." : label}
    </Button>
  );
}

/**
 * Marks a field the form refuses to submit without. Hidden from assistive
 * technology, which already hears "required" from the input's own attribute,
 * so the mark is a visual cue and not a second announcement.
 */
function RequiredMark() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-accent">
      *
    </span>
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
  phoneVerificationEnabled,
  turnstileSiteKey,
}: {
  termsVersion: string | null;
  privacyVersion: string | null;
  /** ADR 0012: false while Twilio is postponed, which removes the code step. */
  phoneVerificationEnabled: boolean;
  turnstileSiteKey: string | null;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("register");
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");

  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Only complain about what the applicant has actually typed: an empty field
  // is not yet wrong, it is unfinished.
  const passwordTooShort = password.length > 0 && password.length < 8;
  const passwordsMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;
  // confirmPassword never reaches the server - registerSchema has no such field
  // - so this is the only place the two are compared at all.
  const passwordsUsable = password.length >= 8 && password === confirmPassword;

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

  // The versions are what gets recorded, so a page that failed to load them
  // must not submit: consentVersionsMatch would reject the empty strings and
  // the applicant would be told the documents had changed.
  const legalReady = termsVersion !== null && privacyVersion !== null;

  const [phoneState, submitPhone] = useActionState(
    async (_prevState: AuthActionResult, formData: FormData) => {
      const p = formData.get("phone") as string;

      // With SMS postponed there is no code to request and no code screen to
      // show; the applicant goes straight to the profile step.
      if (!phoneVerificationEnabled) {
        setPhone(p);
        setStep(3);
        return { success: true, sent: false };
      }

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
      if (phoneVerificationEnabled) {
        formData.append("code", code);
      }
      // Cloudflare injects this input next to the widget inside the form.
      const turnstileToken = formData.get("cf-turnstile-response");
      if (typeof turnstileToken === "string") {
        formData.append("turnstileToken", turnstileToken);
      }
      formData.append(
        "consents",
        // Every acknowledgement, not a filtered subset: with the checkboxes
        // gone, submitting the form is the agreement, and an empty array here
        // would sail past consentVersionsMatch and record nothing at all.
        JSON.stringify(
          consents.map(({ documentId, version }) => ({ documentId, version })),
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
    <AuthShell
      eyebrow="KCLUB MEMBERSHIP"
      title={t("title")}
      subtitle={t("subtitle")}
    >
      <Card className="w-full rounded-none border-white/10 bg-background text-foreground shadow-none">
        <CardHeader className="space-y-4 border-b border-border p-6 sm:p-8">
          <div className="mb-2 flex justify-center gap-2">
            {(phoneVerificationEnabled ? [1, 2, 3] : [1, 3]).map((s) => (
              <div
                key={s}
                className={`h-1 w-10 transition-colors ${
                  step === s ? "bg-accent" : "bg-border"
                }`}
                aria-hidden="true"
              />
            ))}
          </div>
          <CardTitle className="text-center text-3xl font-black uppercase leading-none tracking-[-0.02em] text-foreground">
            {step === 1 && t("step1Title")}
            {step === 2 && t("step2Title")}
            {step === 3 && t("step3Title")}
          </CardTitle>
          {/* Step 1 carries no subtitle: with SMS postponed (ADR 0012) there is
              no code to announce, and an empty element would still take space. */}
          {step !== 1 && (
            <CardDescription className="text-center text-sm font-light leading-6 text-muted-foreground">
              {step === 2 && t("step2Subtitle")}
              {step === 3 && t("step3Subtitle")}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="p-6 sm:p-8">
          {step === 1 && (
            <form
              action={submitPhone}
              className="animate-in space-y-5 fade-in duration-300"
            >
              <div className="space-y-2">
                <Label htmlFor="phone">{tAuth("phoneLabel")}</Label>
                <PhoneInput
                  id="phone"
                  name="phone"
                  countryLabel={tAuth("phoneCountryLabel")}
                  required
                  defaultValue={phone}
                  className="h-12 bg-background"
                />
              </div>
              {phoneState?.error && (
                <p className="border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                  {phoneState.error}
                </p>
              )}
              <SubmitButton label={tAuth("sendCode")} />
            </form>
          )}

          {step === 2 && (
            <form
              onSubmit={handleVerifyCode}
              className="animate-in space-y-5 fade-in duration-300"
            >
              <div className="mb-4 border border-border bg-muted/30 p-3 text-center text-sm text-muted-foreground">
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
                  className="h-12 rounded-none bg-background text-center text-lg tracking-widest"
                />
              </div>
              <Button
                type="submit"
                className="h-12 w-full rounded-none bg-accent text-xs font-black uppercase tracking-[0.16em] text-accent-foreground hover:bg-[#b49126]"
                disabled={code.length !== 6}
              >
                {tAuth("verifyCode")}
              </Button>
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
                >
                  {tCommon("back")}
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <form
              action={submitRegister}
              className="animate-in space-y-5 fade-in duration-300"
            >
              <div className="space-y-2">
                <Label htmlFor="displayName">{t("nameLabel")}</Label>
                <Input
                  id="displayName"
                  name="displayName"
                  required
                  placeholder={t("namePlaceholder")}
                  className="h-12 rounded-none bg-background"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">
                  {tAuth("passwordLabel")}
                  <RequiredMark />
                </Label>
                <PasswordInput
                  id="password"
                  name="password"
                  required
                  minLength={8}
                  placeholder={tAuth("passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  showLabel={tAuth("showPassword")}
                  hideLabel={tAuth("hidePassword")}
                  problem={passwordTooShort ? t("passwordMinLength") : null}
                  className="h-12 rounded-none bg-background"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">
                  {t("passwordConfirmLabel")}
                  <RequiredMark />
                </Label>
                <PasswordInput
                  id="confirmPassword"
                  name="confirmPassword"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  showLabel={tAuth("showPassword")}
                  hideLabel={tAuth("hidePassword")}
                  problem={passwordsMismatch ? t("passwordsNoMatch") : null}
                  className="h-12 rounded-none bg-background"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="country">{t("countryLabel")}</Label>
                <CountrySelect
                  id="country"
                  name="country"
                  placeholder={t("countryLabel")}
                  className="h-12"
                />
              </div>

              {/* The language is no longer asked for: the locale the applicant
                  is already reading the form in is the answer, and registerSchema
                  still requires the field (FR-091). */}
              <input type="hidden" name="language" value={locale} />

              {/* The four acknowledgements are no longer ticked one by one;
                  submitting the form is the act of agreement. Every document is
                  still recorded in legal_acceptances at the version published at
                  submit time (FR-093, FR-097), so the evidence is unchanged -
                  only the interface is. */}
              <p className="border-t border-border pt-5 text-sm font-light leading-6 text-muted-foreground">
                {t.rich("legalNotice", {
                  terms: (chunks) => (
                    <Link
                      href={`/${locale}/legal/terms-of-use`}
                      className="font-bold underline hover:text-accent-ink"
                    >
                      {chunks}
                    </Link>
                  ),
                  privacy: (chunks) => (
                    <Link
                      href={`/${locale}/legal/privacy-policy`}
                      className="font-bold underline hover:text-accent-ink"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </p>

              <TurnstileWidget siteKey={turnstileSiteKey} locale={locale} />

              {registerState?.error && (
                <p className="border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                  {registerState.error}
                </p>
              )}

              <SubmitButton
                label={t("createAccount")}
                disabled={!legalReady || !passwordsUsable}
              />
              {/* Back to whichever step actually precedes this one: the code
                  screen when SMS is on, the phone screen when it is not (ADR
                  0012). Without it a mistyped number could only be corrected by
                  reloading, which loses the whole form. */}
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setStep(phoneVerificationEnabled ? 2 : 1)}
                  className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
                >
                  {tCommon("back")}
                </button>
              </div>
            </form>
          )}
        </CardContent>
        <CardFooter className="justify-center border-t border-border p-6 sm:p-8">
          <p className="text-sm text-muted-foreground">
            {t("haveAccount")}{" "}
            <Link
              href={`/${locale}/login`}
              className="font-bold text-foreground hover:text-accent-ink"
            >
              {t("loginLink")}
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthShell>
  );
}
