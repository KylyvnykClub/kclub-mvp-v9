"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { requestPhoneVerificationAction, registerAction } from "@/actions/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { PhoneField } from "@/components/auth/phone-input";
import { AuthDivider, GoogleButton } from "@/components/auth/google-button";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { CountrySelect } from "@/components/ui/country-select";
import { AGE_ATTESTATION_VERSION } from "@/lib/legal-consents";
import type { RegisterErrorCode } from "@/domain/registration";

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
import { RequiredMark } from "@/components/ui/required-mark";

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
      className="h-12 w-full bg-accent text-xs font-black uppercase tracking-[0.16em] text-accent-foreground hover:bg-[#b49126]"
      disabled={pending || disabled}
    >
      {pending ? pendingLabel || "..." : label}
    </Button>
  );
}

type RegisterResult = {
  success: boolean;
  error?: string;
  /** The box the refusal belongs against, where it is one of the two. */
  field?: "phone" | "email" | null;
  /** The number already belongs to a member (ADR 0030). */
  taken?: boolean;
} | null;

/**
 * Registration, on one screen (FR-001).
 *
 * Everything a member is asked for is visible at once: the number, the name,
 * the address, the password and where they are. It used to be three steps —
 * number, code, then the rest — and the split bought nothing while the SMS
 * code is postponed (ADR 0012), because the middle screen was skipped and the
 * first was one field on a page of its own.
 *
 * The one thing the split did buy was ADR 0030's early "that number is
 * taken", which used to arrive only after the whole form was filled in. On a
 * single screen that message lands against the phone field on submit with
 * every other answer still in place, which is the outcome ADR 0030 was after.
 *
 * The code screen survives, unreachable, behind `phoneVerificationEnabled`:
 * when Twilio comes back the form is filled in first and the code asked for
 * afterwards, so the number is proved without the form being split again.
 */
export function RegisterFlow({
  termsVersion,
  privacyVersion,
  phoneVerificationEnabled,
  turnstileSiteKey,
  google,
  googleEmail,
  googleName,
}: {
  termsVersion: string | null;
  privacyVersion: string | null;
  /** ADR 0012: false while Twilio is postponed, which removes the code step. */
  phoneVerificationEnabled: boolean;
  turnstileSiteKey: string | null;
  /** Whether this deployment has a Google client (ADR 0029). */
  google: boolean;
  /** Proved by Google in this session, or null for an ordinary registration. */
  googleEmail: string | null;
  googleName: string | null;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("register");
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");

  const [awaitingCode, setAwaitingCode] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Held between the form and the code screen, so nothing has to be typed
  // twice when Twilio is switched back on. Null whenever the code screen is
  // not showing.
  const [pendingForm, setPendingForm] = useState<FormData | null>(null);

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

  const [state, submit] = useActionState(
    async (
      _prevState: RegisterResult,
      formData: FormData,
    ): Promise<RegisterResult> => {
      formData.append(
        "consents",
        // Every acknowledgement, not a filtered subset: with the checkboxes
        // gone, submitting the form is the agreement, and an empty array here
        // would sail past consentVersionsMatch and record nothing at all.
        JSON.stringify(
          consents.map(({ documentId, version }) => ({ documentId, version })),
        ),
      );

      // Cloudflare injects this input next to the widget inside the form. It
      // is spent by registerAction and by nothing before it, so carrying it
      // across the code screen is safe.
      const turnstileToken = formData.get("cf-turnstile-response");
      if (typeof turnstileToken === "string") {
        formData.append("turnstileToken", turnstileToken);
      }

      // ADR 0012: while SMS is postponed there is no code to ask for, and the
      // account is created from this one submit.
      if (phoneVerificationEnabled) {
        const submitted = formData.get("phone");
        const requested = await requestPhoneVerificationAction(formData);

        if (requested?.taken) {
          return { success: false, error: "phone_taken", field: "phone" };
        }

        if (!requested?.success) {
          return { success: false, error: "failed" };
        }

        setPhone(typeof submitted === "string" ? submitted : "");
        setPendingForm(formData);
        setAwaitingCode(true);
        return null;
      }

      const result = await registerAction(formData);

      if (result?.success) {
        router.push(`/${locale}/dashboard/profile`);
      }

      return result;
    },
    null,
  );

  const [codeState, submitCode] = useActionState(
    async (_prevState: RegisterResult): Promise<RegisterResult> => {
      if (!pendingForm) return { success: false, error: "failed" };

      pendingForm.set("code", code);
      const result = await registerAction(pendingForm);

      if (result?.success) {
        router.push(`/${locale}/dashboard/profile`);
      }

      return result;
    },
    null,
  );

  const active = awaitingCode ? codeState : state;

  // The two refusals that belong against a box rather than above the button,
  // which is why the action says which field each one was.
  const emailRefused = active?.field === "email";
  const phoneRefused = active?.field === "phone";

  return (
    <AuthShell
      eyebrow="KCLUB MEMBERSHIP"
      title={t("title")}
      subtitle={t("subtitle")}
    >
      <Card className="w-full border-white/10 bg-background text-foreground shadow-none">
        <CardHeader className="space-y-4 border-b border-border p-6 sm:p-8">
          <CardTitle className="text-center text-3xl font-black uppercase leading-none tracking-[-0.02em] text-foreground">
            {awaitingCode ? t("step2Title") : t("title")}
          </CardTitle>
          <CardDescription className="text-center text-sm font-light leading-6 text-muted-foreground">
            {awaitingCode ? t("step2Subtitle") : t("subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 sm:p-8">
          {awaitingCode ? (
            <form
              action={submitCode}
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
                  className="h-12 bg-background text-center text-lg tracking-widest"
                />
              </div>

              {codeState?.error && (
                <p className="border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                  {registerErrorMessage(t, codeState.error)}
                </p>
              )}

              <SubmitButton
                label={t("createAccount")}
                disabled={code.length !== 6}
              />

              {/* Back to the form, with everything still in it: the code
                  screen exists to prove the number, not to make the applicant
                  start again. */}
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setAwaitingCode(false);
                    setPendingForm(null);
                  }}
                  className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
                >
                  {tCommon("back")}
                </button>
              </div>
            </form>
          ) : (
            <form
              action={submit}
              className="animate-in space-y-5 fade-in duration-300"
            >
              {/* Coming back from Google lands here, on the one form, with the
                  address it proved already in the field below. Without this
                  the member picks their Google account and gets what looks
                  like a form that ignored them (ADR 0029). */}
              {googleEmail && (
                <div className="border border-accent/40 bg-accent/10 p-3 text-sm">
                  <p className="font-medium text-foreground">
                    {t("googleConfirmed", { email: googleEmail })}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {t("googleNeedsPhone")}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <PhoneField
                  id="phone"
                  name="phone"
                  label={tAuth("phoneLabel")}
                  requiredMark
                  autoComplete="username"
                  required
                  defaultValue={phone}
                  className="h-12 bg-background"
                />
                {/* ADR 0030 discloses that a number belongs to a member, and
                    says so against the field with everything else still
                    typed. The 20-per-hour limit on the asking is what bounds
                    the disclosure. */}
                {phoneRefused && (
                  <div className="border border-destructive/30 bg-destructive/10 p-3 text-sm">
                    <p className="font-medium text-destructive">
                      {registerErrorMessage(t, active?.error)}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {t("haveAccount")}{" "}
                      <Link
                        href={`/${locale}/login`}
                        className="font-bold text-foreground hover:text-accent-ink"
                      >
                        {t("loginLink")}
                      </Link>
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="displayName">
                  {t("nameLabel")}
                  <RequiredMark />
                </Label>
                <Input
                  id="displayName"
                  name="displayName"
                  required
                  defaultValue={googleName ?? undefined}
                  placeholder={t("namePlaceholder")}
                  className="h-12 bg-background"
                />
              </div>

              {/* Required (ADR 0032): this is the address account recovery
                  runs on, so it is asked for here rather than offered later.
                  Prefilled where Google vouched for one in this session — the
                  applicant may still change it, and then gets the ordinary
                  emailed link instead. */}
              <div className="space-y-2">
                <Label htmlFor="email">
                  {tAuth("emailLabel")}
                  <RequiredMark />
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  maxLength={255}
                  defaultValue={googleEmail ?? undefined}
                  placeholder={tAuth("emailPlaceholder")}
                  aria-invalid={emailRefused || undefined}
                  aria-describedby="email-help"
                  className="h-12 bg-background"
                />
                <p id="email-help" className="text-xs text-muted-foreground">
                  {googleEmail ? t("emailFromGoogle") : t("emailHelp")}
                </p>
                {/* Against the field, and the form keeps everything typed. It
                    says nothing about who holds the address: ADR 0030's
                    disclosure covers the number only (ADR 0032). */}
                {emailRefused && (
                  <p className="text-sm font-medium text-destructive">
                    {registerErrorMessage(t, active?.error)}
                  </p>
                )}
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
                  className="h-12 bg-background"
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
                  className="h-12 bg-background"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="country">
                  {t("countryLabel")}
                  <RequiredMark />
                </Label>
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

              {state?.error && !emailRefused && !phoneRefused && (
                <p className="border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                  {registerErrorMessage(t, state.error)}
                </p>
              )}

              <SubmitButton
                label={t("createAccount")}
                disabled={!legalReady || !passwordsUsable}
              />

              {/* Google settles the address; the phone number still has to be
                  typed either way (ADR 0029). */}
              {google && !googleEmail && (
                <>
                  <AuthDivider />
                  <GoogleButton />
                </>
              )}
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

/**
 * The refusal, in the applicant's language.
 *
 * The action speaks in codes for the reason `src/domain/registration.ts`
 * gives. Anything unrecognised — an older deployment's code, say — falls back
 * to the generic refusal rather than rendering the code itself.
 */
function registerErrorMessage(
  t: ReturnType<typeof useTranslations<"register">>,
  code: string | undefined,
): string {
  // A record rather than a list, so a new code added to `RegisterErrorCode`
  // fails to compile here until it has a message to render.
  const known = {
    invalid_input: true,
    consents_required: true,
    consents_stale: true,
    challenge: true,
    challenge_unavailable: true,
    code_invalid: true,
    phone_taken: true,
    email_taken: true,
    failed: true,
  } satisfies Record<RegisterErrorCode, true>;

  return t(`error.${code && code in known ? code : "failed"}`);
}
