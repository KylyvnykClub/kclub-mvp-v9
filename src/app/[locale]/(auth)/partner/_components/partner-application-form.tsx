"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

import { registerPartnerAction } from "@/actions/partner";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  AccountConsents,
  useAccountConsents,
} from "@/components/auth/account-consents";
import { PasswordInput } from "@/components/auth/password-input";
import { PhoneField } from "@/components/auth/phone-input";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { nextChallengeNonce } from "@/components/auth/turnstile-nonce";
import {
  CompanyFields,
  SectionHeading,
  type CompanyFormValues,
} from "@/components/company/company-fields";
import {
  EMPTY_PARTNER_MEDIA,
  PartnerMediaField,
  type PartnerMedia,
} from "./partner-media-field";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CountrySelect } from "@/components/ui/country-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequiredMark } from "@/components/ui/required-mark";
import { AGE_ATTESTATION_VERSION } from "@/lib/legal-consents";
import {
  ApplicationConsents,
  useApplicationConsents,
} from "@/components/company/application-consents";
import {
  COMPANY_FIELD_LABEL_KEYS,
  type CompanyFormIssue,
} from "@/lib/company-form";
import type { RegisterErrorCode } from "@/domain/registration";

/**
 * Business partner registration, on one page (FR-109).
 *
 * The account and the application are one form and one submit. The order is
 * the one the business thinks in: what it does, what it says about itself,
 * what it offers, where it operates — and the account details it needs an
 * account for, at the end, where they read as a formality rather than as a
 * club sign-up standing between the business and the form.
 *
 * Nothing on this page takes money and it says so. The listing is paid for
 * once a human has approved the application (ADR 0036, FR-111), so the price
 * is shown as what it will cost rather than as what is being charged.
 */

/** The fields the company half posts. Mirrors the dashboard form's list. */
const COMPANY_FIELDS = [
  "name",
  "legalName",
  "taxId",
  "website",
  "description",
  "specializationDescription",
  "businessCategoryIds",
  "registrationCountryCode",
  "serviceCountryCodes",
  "servesWorldwide",
  "businessFormat",
  "city",
  "administrativeLevel1",
  "discount",
  "specialPrivileges",
  "specialPrivilegesNote",
  "contactEmail",
  "contactPhone",
] as const;

export function PartnerApplicationForm({
  signedIn,
  termsVersion,
  privacyVersion,
  turnstileSiteKey,
  listingPrice,
  invited,
  waived,
  residenceCountry,
}: {
  /** True for a partner finishing an application their account already has. */
  signedIn: boolean;
  termsVersion: string | null;
  privacyVersion: string | null;
  turnstileSiteKey: string | null;
  listingPrice: string;
  /** ADR 0044: on the invite route - a free month from publication. */
  invited: boolean;
  /** ADR 0040: the club's partner link lists this business free. */
  waived: boolean;
  /** A signed-in applicant's country of residence, as their account has it. */
  residenceCountry: string | null;
}) {
  const t = useTranslations("partnerApply");
  const tAuth = useTranslations("auth");
  const tRegister = useTranslations("register");
  const tCompany = useTranslations("company");
  const tDashboard = useTranslations("dashboard");
  const tConsents = useTranslations("applicationConsents");
  const locale = useLocale();

  const [values, setValues] = useState<CompanyFormValues>({
    servesWorldwide: "false",
  });
  const [media, setMedia] = useState<PartnerMedia>(EMPTY_PARTNER_MEDIA);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Controlled for the reason the registration form's are: React resets an
  // uncontrolled field when the form's action resolves, and a refusal that
  // silently empties two required boxes makes the next submit impossible.
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [challengeNonce, setChallengeNonce] = useState(0);
  // Followed so the EU withdrawal right appears for an EU resident as soon
  // as they pick the country, not after a refused submit.
  const [country, setCountry] = useState("");
  const accountConsents = useAccountConsents();
  const applicationConsents = useApplicationConsents({
    invited,
    waived,
    residenceCountry: signedIn ? residenceCountry : country || null,
  });

  // Only complain about what the applicant has actually typed: an empty field
  // is not yet wrong, it is unfinished.
  const passwordTooShort = password.length > 0 && password.length < 8;
  const passwordsMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;
  const passwordsUsable = password.length >= 8 && password === confirmPassword;

  const consents = useMemo(
    () => [
      { documentId: "terms-of-use", version: termsVersion ?? "" },
      { documentId: "privacy-policy", version: privacyVersion ?? "" },
      { documentId: "arbitration", version: termsVersion ?? "" },
      { documentId: "age-verification", version: AGE_ATTESTATION_VERSION },
    ],
    [termsVersion, privacyVersion],
  );

  // The versions are what gets recorded, so a page that failed to load them
  // must not submit: the server would reject the empty strings and the
  // applicant would be told the documents had changed.
  const legalReady =
    signedIn || (termsVersion !== null && privacyVersion !== null);

  const [state, submit, submitting] = useActionState(
    async (previous: State, formData: FormData): Promise<State> => {
      if (!signedIn) {
        // Every acknowledgement, not a filtered subset: submitting the form is
        // the agreement, and an empty array would record nothing at all.
        formData.append("consents", JSON.stringify(consents));

        // Cloudflare injects this input next to the widget inside the form.
        const token = formData.get("cf-turnstile-response");
        if (typeof token === "string") {
          formData.append("turnstileToken", token);
        }
      }

      // The pictures ride along with the submit. They cannot be staged the
      // way the dashboard form stages them - ADR 0024 stages under a member
      // id, and until this request there is no member - and uploading them
      // from here afterwards would race the navigation this action's response
      // triggers.
      if (media.logo) formData.set("logoFile", media.logo);
      for (const image of media.images) formData.append("galleryFile", image);

      const result = await registerPartnerAction(previous, formData);

      // A single-use token was spent on that attempt whatever came back, so a
      // second try needs a new challenge or it fails for the challenge rather
      // than for what the applicant corrected.
      setChallengeNonce((n) =>
        nextChallengeNonce(n, { success: Boolean(result?.success) }),
      );

      return result;
    },
    null,
  );

  function companyIssueMessage(issue: CompanyFormIssue): string {
    const reason = tCompany(`errors.${issue.code}`, {
      limit: issue.limit ?? 0,
    });
    const labelKey = issue.field
      ? COMPANY_FIELD_LABEL_KEYS[issue.field]
      : undefined;

    return labelKey
      ? tCompany("errors.aboutField", { field: tCompany(labelKey), reason })
      : reason;
  }

  // Reached only if the page does not send them onward. A successful submit
  // normally lands on the standing screen: this action's response re-renders
  // `/partner`, and that page forwards an applicant who now has an
  // application. This is the fallback for when it does not, because a form
  // that just redisplays itself after a successful submit reads as a failure.
  if (state?.success) {
    return (
      <AuthShell
        eyebrow={t("eyebrow")}
        title={t("receivedTitle")}
        subtitle={t("receivedSubtitle")}
      >
        <Card className="w-full border-white/10 bg-background text-foreground shadow-none">
          <CardContent className="space-y-5 p-6 sm:p-8">
            <p className="text-sm leading-6 text-foreground">
              {t("receivedBody")}
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              {t("receivedPayment", { price: listingPrice })}
            </p>
            <Button asChild className="h-12 w-full">
              <Link href={`/${locale}/membership`}>{t("receivedCta")}</Link>
            </Button>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  const accountRefused = state?.accountError !== undefined;
  const phoneRefused = accountRefused && state?.accountField === "phone";
  const emailRefused = accountRefused && state?.accountField === "email";

  return (
    <AuthShell
      eyebrow={t("eyebrow")}
      title={t("title")}
      subtitle={t("subtitle")}
    >
      <Card className="w-full border-white/10 bg-background text-foreground shadow-none">
        <CardHeader className="space-y-3 border-b border-border p-6 sm:p-8">
          <CardTitle className="text-2xl font-black uppercase leading-none tracking-[-0.02em] text-foreground">
            {t("title")}
          </CardTitle>
          {/* FR-111: what it will cost, and when. Not a charge. */}
          <p className="text-sm font-light leading-6 text-muted-foreground">
            {t("priceNote", { price: listingPrice })}
          </p>
        </CardHeader>

        <CardContent className="p-6 sm:p-8">
          {/* Submitted by hand rather than through `action`: React 19 resets
              a form after its action returns, and the reset event makes each
              Radix checkbox drop back to unchecked - which silently cleared the
              chosen subcategory after any refusal, so the next attempt failed
              on a field the applicant had already filled. */}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              startTransition(() => submit(formData));
            }}
            className="space-y-8"
          >
            {state?.issue && (
              <p
                role="alert"
                className="border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive"
              >
                {companyIssueMessage(state.issue)}
              </p>
            )}

            <CompanyFields values={values} setValues={setValues} />

            <section className="space-y-4">
              <SectionHeading>
                {tDashboard("onboardingMediaSection")}
              </SectionHeading>
              <p className="text-sm text-muted-foreground">
                {tDashboard("onboardingMediaNote")}
              </p>
              <PartnerMediaField media={media} onChange={setMedia} />
            </section>

            {!signedIn && (
              <section className="space-y-5">
                <SectionHeading>{t("accountSection")}</SectionHeading>
                <p className="text-sm text-muted-foreground">
                  {t("accountNote")}
                </p>

                <div className="space-y-2">
                  <PhoneField
                    id="phone"
                    name="phone"
                    label={tAuth("phoneLabel")}
                    // Same as registration: most of the club dials +380, and
                    // "050..." under a US code is refused as invalid.
                    defaultCountry={locale === "uk" ? "UA" : undefined}
                    requiredMark
                    autoComplete="username"
                    required
                    className="h-12 bg-background"
                  />
                  {phoneRefused && (
                    <div className="border border-destructive/30 bg-destructive/10 p-3 text-sm">
                      <p className="font-medium text-destructive">
                        {accountErrorMessage(tRegister, state?.accountError)}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {tRegister("haveAccount")}{" "}
                        <Link
                          href={`/${locale}/login`}
                          className="font-bold text-foreground hover:text-accent-ink"
                        >
                          {tRegister("loginLink")}
                        </Link>
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="displayName">
                    {t("contactNameLabel")}
                    <RequiredMark />
                  </Label>
                  <Input
                    id="displayName"
                    name="displayName"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t("contactNamePlaceholder")}
                    className="h-12 bg-background"
                  />
                </div>

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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={tAuth("emailPlaceholder")}
                    aria-invalid={emailRefused || undefined}
                    className="h-12 bg-background"
                  />
                  {emailRefused && (
                    <p className="text-sm font-medium text-destructive">
                      {accountErrorMessage(tRegister, state?.accountError)}
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
                    problem={
                      passwordTooShort ? tRegister("passwordMinLength") : null
                    }
                    className="h-12 bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">
                    {tRegister("passwordConfirmLabel")}
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
                    problem={
                      passwordsMismatch ? tRegister("passwordsNoMatch") : null
                    }
                    className="h-12 bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="country">
                    {tConsents("residenceLabel")}
                    <RequiredMark />
                  </Label>
                  <CountrySelect
                    id="country"
                    name="country"
                    value={country}
                    onChange={setCountry}
                    placeholder={tConsents("residenceLabel")}
                    className="h-12"
                  />
                </div>

                {/* The locale they are reading the form in is the answer; the
                    schema still requires the field (FR-091). */}
                <input type="hidden" name="language" value={locale} />

                <AccountConsents state={accountConsents} />

                <TurnstileWidget
                  siteKey={turnstileSiteKey}
                  locale={locale}
                  nonce={challengeNonce}
                />
              </section>
            )}

            {/* ADR 0044: under the account block, before the Stripe button. */}
            <ApplicationConsents
              listingPrice={listingPrice}
              consents={applicationConsents}
            />

            {COMPANY_FIELDS.map((field) => (
              <input
                key={field}
                type="hidden"
                name={field}
                value={values[field] ?? ""}
              />
            ))}

            {accountRefused && !phoneRefused && !emailRefused && (
              <p
                role="alert"
                className="border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive"
              >
                {accountErrorMessage(tRegister, state?.accountError)}
              </p>
            )}

            <Submit
              label={applicationConsents.state.submitLabel}
              pendingLabel={t("submitting")}
              pending={submitting}
              disabled={
                !legalReady ||
                !applicationConsents.state.complete ||
                (!signedIn && (!passwordsUsable || !accountConsents.complete))
              }
            />
            {applicationConsents.state.submitNote && (
              <p className="-mt-4 text-center text-sm text-muted-foreground">
                {applicationConsents.state.submitNote}
              </p>
            )}
          </form>
        </CardContent>

        <CardFooter className="justify-center border-t border-border p-6 sm:p-8">
          <p className="text-sm text-muted-foreground">
            {tRegister("haveAccount")}{" "}
            <Link
              href={`/${locale}/login`}
              className="font-bold text-foreground hover:text-accent-ink"
            >
              {tRegister("loginLink")}
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthShell>
  );
}

type State = Awaited<ReturnType<typeof registerPartnerAction>>;

function Submit({
  label,
  pendingLabel,
  pending,
  disabled,
}: {
  label: string;
  pendingLabel: string;
  pending: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      type="submit"
      className="h-12 w-full bg-accent text-xs font-black uppercase tracking-[0.16em] text-accent-foreground hover:bg-[#b49126]"
      disabled={pending || disabled}
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * The account refusal, in the applicant's language. Same catalogue the member
 * form reads, because it is the same registration underneath.
 */
function accountErrorMessage(
  t: ReturnType<typeof useTranslations<"register">>,
  code: string | undefined,
): string {
  const known = {
    invalid_input: true,
    consents_required: true,
    consents_stale: true,
    challenge: true,
    challenge_unavailable: true,
    code_invalid: true,
    throttled: true,
    phone_taken: true,
    email_taken: true,
    failed: true,
  } satisfies Record<RegisterErrorCode, true>;

  return t(`error.${code && code in known ? code : "failed"}`);
}
