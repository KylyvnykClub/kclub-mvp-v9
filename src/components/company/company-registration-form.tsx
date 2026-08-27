"use client";

import {
  useState,
  useEffect,
  useActionState,
  useMemo,
  useRef,
  useTransition,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import {
  registerCompanyAction,
  saveCompanyDraftAction,
  getCompanyDraftAction,
  getLocalizedCategoryTreeAction,
} from "@/actions/company";
import { createCheckoutSessionAction } from "@/actions/stripe";
import {
  COMPANY_FIELD_LABEL_KEYS,
  COMPANY_FORM_STEPS,
  COMPANY_STEP_SCHEMAS,
  describeCompanyIssue,
  type CompanyFormIssue,
  type CompanyStepNumber,
} from "@/lib/company-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { countryOptions } from "@/lib/countries";
import type { Locale } from "@/i18n/routing";
import type { CategoryTreeRow } from "@/data/companies";

/**
 * The four-step company submission form (FR-040).
 *
 * Steps follow ux.md §3.3: business details, location and category, the
 * discount offered, then review and confirm. Each completed step is written to
 * a server-side draft, so a refresh or a lost connection costs the applicant
 * nothing.
 */

const SELECT_CLASS =
  "flex h-10 w-full rounded-none border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

/** Every value the form collects, held as strings until the server parses them. */
type FormValues = Record<string, string>;

const STEP_FIELDS: Record<number, string[]> = {
  1: [
    "name",
    "legalName",
    "taxId",
    "website",
    "logoUrl",
    "description",
    "specializationDescription",
  ],
  2: [
    "block",
    "category",
    "businessCategoryIds",
    "registrationCountryCode",
    "serviceCountryCodes",
    "servesWorldwide",
    "businessFormat",
    "administrativeLevel1",
    "administrativeLevel2",
    "city",
  ],
  3: ["discount", "contactEmail", "contactPhone"],
};

export function CompanyRegistrationForm() {
  const t = useTranslations("company");
  const locale = useLocale() as Locale;
  const [state, action, pending] = useActionState(registerCompanyAction, null);

  const [step, setStep] = useState<CompanyStepNumber>(1);
  const [values, setValues] = useState<FormValues>({
    servesWorldwide: "false",
  });
  const [stepIssue, setStepIssue] = useState<CompanyFormIssue | null>(null);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [openingCheckout, startCheckout] = useTransition();
  const checkoutStarted = useRef(false);

  const [taxonomy, setTaxonomy] = useState<CategoryTreeRow[]>([]);
  const [subcategories, setSubcategories] = useState<
    { id: number; subcategory: string }[]
  >([]);

  const selectedBlock = values.block ?? "";
  const selectedCategory = values.category ?? "";
  const selectedCategoryIds = (values.businessCategoryIds ?? "")
    .split(",")
    .filter(Boolean);
  const countries = useMemo(() => countryOptions(locale), [locale]);
  const blocks = useMemo(
    () => [...new Set(taxonomy.map((row) => row.block))],
    [taxonomy],
  );
  const categories = useMemo(
    () => [
      ...new Set(
        taxonomy
          .filter((row) => row.block === selectedBlock)
          .map((row) => row.category),
      ),
    ],
    [taxonomy, selectedBlock],
  );

  const set = (field: string, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  // Resume an unfinished application before anything else is touched.
  useEffect(() => {
    void getCompanyDraftAction()
      .then((draft) => {
        if (draft) {
          setValues({
            servesWorldwide: "false",
            ...Object.fromEntries(
              Object.entries(draft.data)
                .filter(([, value]) => value !== undefined && value !== null)
                .map(([key, value]) => [key, String(value)]),
            ),
          });
          setStep(draft.step);
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    void getLocalizedCategoryTreeAction(locale).then(setTaxonomy);
  }, [locale]);

  useEffect(() => {
    if (!selectedBlock || !selectedCategory) {
      setSubcategories([]);
      return;
    }
    setSubcategories(
      taxonomy
        .filter(
          (row) =>
            row.block === selectedBlock && row.category === selectedCategory,
        )
        .map((row) => ({ id: row.id, subcategory: row.subcategory })),
    );
  }, [taxonomy, selectedBlock, selectedCategory]);

  async function goNext() {
    setStepIssue(null);

    const fields = STEP_FIELDS[step] ?? [];
    const stepValues = Object.fromEntries(
      fields.map((field) => [field, values[field] ?? ""]),
    );

    // Validate with the same schema the server uses, so the applicant is not
    // sent to the wire to be told what the browser already knew.
    const schema =
      COMPANY_STEP_SCHEMAS[step as keyof typeof COMPANY_STEP_SCHEMAS];
    if (schema) {
      const parsed = schema.safeParse(stepValues);
      if (!parsed.success) {
        setStepIssue(describeCompanyIssue(parsed.error));
        return;
      }
    }

    setSaving(true);
    const saved = await saveCompanyDraftAction(step, stepValues);
    setSaving(false);

    if (!saved.success) {
      setStepIssue(saved.issue ?? { code: "unexpected" });
      return;
    }

    setStep((current) =>
      current < COMPANY_FORM_STEPS
        ? ((current + 1) as CompanyStepNumber)
        : current,
    );
  }

  /**
   * Hand the freshly created company off to listing checkout (ADR 0019).
   *
   * `createCheckoutSessionAction` ends in a redirect to Stripe, so on the happy
   * path nothing after it runs. A throw that does land here is a real failure,
   * and the application is already saved - the owner keeps the retry button and
   * can also pay later from Profile > Companies.
   */
  function openCheckout(companyId: string) {
    setCheckoutError(null);
    startCheckout(async () => {
      try {
        await createCheckoutSessionAction(companyId);
      } catch {
        setCheckoutError(t("checkoutFailed"));
      }
    });
  }

  // Submitting is the moment of intent, so checkout opens on its own rather
  // than waiting for a second click. The ref keeps it to one attempt.
  useEffect(() => {
    if (!state?.success || !state.companyId || checkoutStarted.current) return;
    checkoutStarted.current = true;
    openCheckout(state.companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.success, state?.companyId]);

  /**
   * Turn a refusal into a sentence in the applicant's own language, naming the
   * field they have to go back and change.
   *
   * The action reports a code rather than prose precisely so this can happen
   * here: Zod's own messages are English, and one of them - "Invalid input" -
   * says nothing at all about which of eighteen fields is wrong.
   */
  function issueMessage(reported: CompanyFormIssue): string {
    const reason = t(`errors.${reported.code}`, { limit: reported.limit ?? 0 });
    const labelKey = reported.field
      ? COMPANY_FIELD_LABEL_KEYS[reported.field]
      : undefined;

    return labelKey
      ? t("errors.aboutField", { field: t(labelKey), reason })
      : reason;
  }

  function goBack() {
    setStepIssue(null);
    setStep((current) =>
      current > 1 ? ((current - 1) as CompanyStepNumber) : current,
    );
  }

  if (state?.success) {
    return (
      <div className="space-y-4 border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-500">
        <p className="font-bold">{t("successTitle")}</p>
        <p className="text-muted-foreground">{t("checkoutHandoff")}</p>
        {checkoutError && (
          <p className="text-destructive" role="alert">
            {checkoutError}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <Button
            type="button"
            disabled={openingCheckout || !state.companyId}
            onClick={() => state.companyId && openCheckout(state.companyId)}
          >
            {openingCheckout ? t("checkoutOpening") : t("checkoutContinue")}
          </Button>
          <Link
            href="/dashboard/profile"
            className="underline hover:text-green-400"
          >
            {t("returnToProfile")}
          </Link>
        </div>
      </div>
    );
  }

  const issue = stepIssue ?? state?.issue ?? null;

  if (!hydrated) {
    return <p className="text-sm text-muted-foreground">{t("draftLoading")}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p
          className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground"
          aria-live="polite"
        >
          {t("stepOf", { current: step, total: COMPANY_FORM_STEPS })}
        </p>
        <ol className="flex gap-2" aria-label={t("progressLabel")}>
          {Array.from({ length: COMPANY_FORM_STEPS }, (_, index) => (
            <li
              key={index}
              aria-current={index + 1 === step ? "step" : undefined}
              className={`h-1 flex-1 ${
                index + 1 <= step ? "bg-accent" : "bg-border"
              }`}
            />
          ))}
        </ol>
      </div>

      {issue && (
        <p
          role="alert"
          className="text-sm text-red-500 bg-red-500/10 p-3 rounded-none border border-red-500/20"
        >
          {issueMessage(issue)}
        </p>
      )}

      {step === 1 && (
        <section className="space-y-4">
          <h2 className="font-serif text-xl border-b border-border/50 pb-2">
            {t("detailsSection")}
          </h2>

          <Field id="name" label={t("nameLabel")}>
            <Input
              id="name"
              value={values.name ?? ""}
              placeholder={t("namePlaceholder")}
              onChange={(e) => set("name", e.target.value)}
              required
            />
          </Field>

          <Field id="legalName" label={t("legalNameLabel")}>
            <Input
              id="legalName"
              value={values.legalName ?? ""}
              placeholder={t("legalNamePlaceholder")}
              onChange={(e) => set("legalName", e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field id="taxId" label={t("taxIdLabel")}>
              <Input
                id="taxId"
                value={values.taxId ?? ""}
                placeholder="12345678"
                onChange={(e) => set("taxId", e.target.value)}
              />
            </Field>
            <Field id="website" label={t("websiteLabel")}>
              <Input
                id="website"
                value={values.website ?? ""}
                placeholder="https://acme.com"
                onChange={(e) => set("website", e.target.value)}
              />
            </Field>
          </div>

          <Field id="logoUrl" label={t("logoLabel")}>
            <Input
              id="logoUrl"
              value={values.logoUrl ?? ""}
              placeholder="https://acme.com/logo.png"
              onChange={(e) => set("logoUrl", e.target.value)}
            />
          </Field>

          <Field id="description" label={t("descriptionLabel")}>
            <Textarea
              id="description"
              value={values.description ?? ""}
              placeholder={t("descriptionPlaceholder")}
              rows={4}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>

          <Field
            id="specializationDescription"
            label={t("specializationLabel")}
          >
            <Textarea
              id="specializationDescription"
              value={values.specializationDescription ?? ""}
              placeholder={t("specializationPlaceholder")}
              rows={4}
              maxLength={500}
              onChange={(e) => set("specializationDescription", e.target.value)}
              required
            />
          </Field>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <h2 className="font-serif text-xl border-b border-border/50 pb-2">
            {t("categorySection")}
          </h2>

          <Field id="block" label={t("blockLabel")}>
            <select
              id="block"
              className={SELECT_CLASS}
              value={selectedBlock}
              onChange={(e) => {
                setValues((current) => ({
                  ...current,
                  block: e.target.value,
                  category: "",
                  businessCategoryIds: "",
                }));
              }}
              required
            >
              <option value="">{t("blockPlaceholder")}</option>
              {blocks.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>

          <Field id="category" label={t("categoryLabel")}>
            <select
              id="category"
              className={SELECT_CLASS}
              value={selectedCategory}
              disabled={!selectedBlock}
              onChange={(e) => {
                setValues((current) => ({
                  ...current,
                  category: e.target.value,
                  businessCategoryIds: "",
                }));
              }}
              required
            >
              <option value="">{t("categoryPlaceholder")}</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>

          <Field id="businessCategoryIds" label={t("subcategoryLabel")}>
            <select
              id="businessCategoryIds"
              className={`${SELECT_CLASS} h-32`}
              multiple
              disabled={!selectedCategory}
              value={selectedCategoryIds}
              onChange={(e) => {
                const selected = Array.from(
                  e.currentTarget.selectedOptions,
                  (option) => option.value,
                );
                if (selected.length > 7) return;
                set("businessCategoryIds", selected.join(","));
              }}
              required
            >
              {subcategories.map((sc) => (
                <option key={sc.id} value={String(sc.id)}>
                  {sc.subcategory}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {t("subcategoryHint", {
                count: selectedCategoryIds.length,
                max: 7,
              })}
            </p>
          </Field>

          <Field
            id="registrationCountryCode"
            label={t("registrationCountryLabel")}
          >
            <select
              id="registrationCountryCode"
              className={SELECT_CLASS}
              value={values.registrationCountryCode ?? ""}
              onChange={(e) => set("registrationCountryCode", e.target.value)}
              required
            >
              <option value="">{t("registrationCountryPlaceholder")}</option>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
          </Field>

          <Field id="businessFormat" label={t("businessFormatLabel")}>
            <select
              id="businessFormat"
              className={SELECT_CLASS}
              value={values.businessFormat ?? ""}
              onChange={(e) => set("businessFormat", e.target.value)}
              required
            >
              <option value="">{t("businessFormatPlaceholder")}</option>
              <option value="offline_only">{t("businessFormatOffline")}</option>
              <option value="online_only">{t("businessFormatOnline")}</option>
              <option value="online_offline">
                {t("businessFormatHybrid")}
              </option>
              <option value="on_site_service">
                {t("businessFormatOnSite")}
              </option>
            </select>
          </Field>

          <Field id="serviceCountryCodes" label={t("serviceCountriesLabel")}>
            <select
              id="serviceCountryCodes"
              className={`${SELECT_CLASS} h-32`}
              multiple
              disabled={values.servesWorldwide === "true"}
              value={(values.serviceCountryCodes ?? "")
                .split(",")
                .filter(Boolean)}
              onChange={(e) =>
                set(
                  "serviceCountryCodes",
                  Array.from(
                    e.currentTarget.selectedOptions,
                    (option) => option.value,
                  ).join(","),
                )
              }
            >
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={values.servesWorldwide === "true"}
                onChange={(e) =>
                  set("servesWorldwide", e.target.checked ? "true" : "false")
                }
              />
              {t("worldwideLabel")}
            </label>
          </Field>

          {values.businessFormat !== "online_only" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="administrativeLevel1"
                label={t("administrativeLevel1Label")}
              >
                <Input
                  id="administrativeLevel1"
                  value={values.administrativeLevel1 ?? ""}
                  onChange={(e) => set("administrativeLevel1", e.target.value)}
                  required
                />
              </Field>
              <Field
                id="administrativeLevel2"
                label={t("administrativeLevel2Label")}
              >
                <Input
                  id="administrativeLevel2"
                  value={values.administrativeLevel2 ?? ""}
                  onChange={(e) => set("administrativeLevel2", e.target.value)}
                />
              </Field>
              <Field id="city" label={t("cityLabel")}>
                <Input
                  id="city"
                  value={values.city ?? ""}
                  onChange={(e) => set("city", e.target.value)}
                  required
                />
              </Field>
            </div>
          )}
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <h2 className="font-serif text-xl border-b border-border/50 pb-2">
            {t("partnerSection")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("partnerNote")}</p>

          <Field id="discount" label={t("discountLabel")}>
            <Input
              id="discount"
              value={values.discount ?? ""}
              placeholder={t("discountPlaceholder")}
              onChange={(e) => set("discount", e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field id="contactEmail" label={t("contactEmailLabel")}>
              <Input
                id="contactEmail"
                type="email"
                value={values.contactEmail ?? ""}
                placeholder="partners@acme.com"
                onChange={(e) => set("contactEmail", e.target.value)}
              />
            </Field>
            <Field id="contactPhone" label={t("contactPhoneLabel")}>
              <Input
                id="contactPhone"
                value={values.contactPhone ?? ""}
                placeholder="+380991234567"
                onChange={(e) => set("contactPhone", e.target.value)}
              />
            </Field>
          </div>
        </section>
      )}

      {step === COMPANY_FORM_STEPS && (
        <form action={action} className="space-y-4">
          <h2 className="font-serif text-xl border-b border-border/50 pb-2">
            {t("reviewSection")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("reviewNote")}</p>

          <dl className="divide-y divide-border/50 border border-border/50">
            {REVIEW_FIELDS.map((field) => (
              <div key={field} className="flex gap-4 p-3 text-sm">
                <dt className="w-1/3 text-muted-foreground">
                  {t(COMPANY_FIELD_LABEL_KEYS[field] ?? field)}
                </dt>
                <dd className="w-2/3 break-words">
                  {field === "businessCategoryIds"
                    ? selectedCategoryIds.length > 0
                      ? selectedCategoryIds
                          .map(
                            (id) =>
                              subcategories.find((sc) => String(sc.id) === id)
                                ?.subcategory,
                          )
                          .filter(Boolean)
                          .join(", ") || t("notProvided")
                      : t("notProvided")
                    : (values[field] ?? "") || t("notProvided")}
                </dd>
              </div>
            ))}
          </dl>

          {SUBMITTED_FIELDS.map((field) => (
            <input
              key={field}
              type="hidden"
              name={field}
              value={values[field] ?? ""}
            />
          ))}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? t("submitting") : t("submit")}
          </Button>
        </form>
      )}

      <div className="flex gap-3">
        {step > 1 && (
          <Button type="button" variant="outline" onClick={goBack}>
            {t("back")}
          </Button>
        )}
        {step < COMPANY_FORM_STEPS && (
          <Button
            type="button"
            onClick={() => void goNext()}
            disabled={saving}
            className="ml-auto"
          >
            {saving ? t("draftSaving") : t("next")}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Fields sent to `registerCompanyAction`; the two breadcrumbs are not. */
const SUBMITTED_FIELDS = [
  "name",
  "legalName",
  "taxId",
  "website",
  "logoUrl",
  "description",
  "specializationDescription",
  "businessCategoryIds",
  "registrationCountryCode",
  "serviceCountryCodes",
  "servesWorldwide",
  "businessFormat",
  "administrativeLevel1",
  "administrativeLevel2",
  "city",
  "discount",
  "contactEmail",
  "contactPhone",
] as const;

/** Review order. The label for each comes from the shared field-label map. */
const REVIEW_FIELDS = [
  "name",
  "legalName",
  "taxId",
  "website",
  "description",
  "specializationDescription",
  "businessCategoryIds",
  "registrationCountryCode",
  "serviceCountryCodes",
  "businessFormat",
  "administrativeLevel1",
  "administrativeLevel2",
  "city",
  "discount",
  "contactEmail",
  "contactPhone",
] as const;

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
