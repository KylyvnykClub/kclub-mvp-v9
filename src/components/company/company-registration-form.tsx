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
import { X } from "lucide-react";
import {
  registerCompanyAction,
  saveCompanyDraftAction,
  getCompanyDraftAction,
  getLocalizedCategoryTreeAction,
} from "@/actions/company";
import { listCitiesForCountryAction } from "@/actions/cities";
import {
  deleteDraftImageAction,
  removeDraftLogoAction,
  uploadDraftImageAction,
  uploadDraftLogoAction,
} from "@/actions/company-draft-media";
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
import { Checkbox } from "@/components/ui/checkbox";
import { CountrySelect } from "@/components/ui/country-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { countryOptions } from "@/lib/countries";
import { COMPANY_GALLERY_MAX_IMAGES } from "@/lib/company-image-path";
import {
  DRAFT_LOGO_SLOT,
  draftMediaServePath,
  parseDraftImageIds,
} from "@/lib/draft-media-path";
import type { Locale } from "@/i18n/routing";
import type { CategoryTreeRow } from "@/data/companies";

/**
 * The four-step company submission form (FR-040).
 *
 * Steps follow ux.md §3.3: business details and contacts, location and
 * category, logo and photos, then review and confirm. Each completed step is
 * written to a server-side draft, so a refresh or a lost connection costs the
 * applicant nothing. Media on step 3 is staged under the draft and promoted to
 * the company on submission (ADR 0024).
 */

const SELECT_CLASS =
  "flex h-10 w-full rounded-none border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const FILE_INPUT_CLASS =
  "block w-full max-w-xs text-sm text-muted-foreground file:mr-3 file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-bold file:uppercase file:tracking-[0.1em]";

/** Every value the form collects, held as strings until the server parses them. */
type FormValues = Record<string, string>;

const STEP_FIELDS: Record<number, string[]> = {
  1: [
    "name",
    "legalName",
    "taxId",
    "website",
    "description",
    "specializationDescription",
    "discount",
    "contactEmail",
    "contactPhone",
  ],
  2: [
    "block",
    "category",
    "businessCategoryIds",
    "registrationCountryCode",
    "serviceCountryCodes",
    "servesWorldwide",
    "businessFormat",
    "city",
  ],
  3: ["logoStaged", "galleryImageIds"],
};

const IMAGE_ERROR_KEYS: Record<string, string> = {
  gallery_full: "galleryErrorFull",
  too_large: "avatarErrorTooLarge",
  unreadable: "avatarErrorUnreadable",
  unsupported_format: "avatarErrorUnsupportedFormat",
  processing_failed: "avatarErrorProcessingFailed",
};

export function CompanyRegistrationForm() {
  const t = useTranslations("company");
  const tDashboard = useTranslations("dashboard");
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

  const stagedImageIds = parseDraftImageIds(values.galleryImageIds);

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

          <h2 className="font-serif text-xl border-b border-border/50 pb-2 pt-4">
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
            <div
              id="businessCategoryIds"
              role="group"
              aria-label={t("subcategoryLabel")}
              className={`grid gap-x-4 gap-y-2 border border-input bg-background p-3 max-h-64 overflow-y-auto ${
                subcategories.length > 6 ? "sm:grid-cols-2" : ""
              } ${!selectedCategory ? "opacity-50" : ""}`}
            >
              {subcategories.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("subcategoryPlaceholder")}
                </p>
              ) : (
                subcategories.map((sc) => {
                  const value = String(sc.id);
                  const checked = selectedCategoryIds.includes(value);
                  const disabled =
                    !selectedCategory ||
                    (!checked && selectedCategoryIds.length >= 7);

                  return (
                    <label
                      key={sc.id}
                      className="flex items-center gap-2 text-sm leading-tight"
                    >
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(next) => {
                          const nextSelected = next
                            ? [...selectedCategoryIds, value]
                            : selectedCategoryIds.filter((id) => id !== value);
                          set("businessCategoryIds", nextSelected.join(","));
                        }}
                      />
                      {sc.subcategory}
                    </label>
                  );
                })
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("subcategoryHint", {
                count: selectedCategoryIds.length,
                max: 7,
              })}
            </p>
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

          <Field
            id="registrationCountryCode"
            label={t("registrationCountryLabel")}
          >
            <CountrySelect
              id="registrationCountryCode"
              value={values.registrationCountryCode ?? ""}
              onChange={(code) =>
                setValues((current) => ({
                  ...current,
                  registrationCountryCode: code,
                  // A city belongs to a country; changing one empties the other.
                  city: "",
                }))
              }
              placeholder={t("registrationCountryPlaceholder")}
            />
          </Field>

          {values.businessFormat !== "online_only" && (
            <CityPicker
              countryCode={values.registrationCountryCode ?? ""}
              value={values.city ?? ""}
              onChange={(city) => set("city", city)}
            />
          )}

          <ServiceCountriesPicker
            countries={countries}
            registrationCountryCode={values.registrationCountryCode ?? ""}
            codes={(values.serviceCountryCodes ?? "")
              .split(",")
              .filter(Boolean)}
            worldwide={values.servesWorldwide === "true"}
            onCodesChange={(codes) =>
              set("serviceCountryCodes", codes.join(","))
            }
            onWorldwideChange={(next) =>
              set("servesWorldwide", next ? "true" : "false")
            }
          />
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <h2 className="font-serif text-xl border-b border-border/50 pb-2">
            {tDashboard("onboardingMediaSection")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {tDashboard("onboardingMediaNote")}
          </p>

          <DraftLogoField
            staged={values.logoStaged === "true"}
            onChange={(staged) => set("logoStaged", staged ? "true" : "")}
          />

          <DraftGalleryField
            imageIds={stagedImageIds}
            onChange={(ids) => set("galleryImageIds", ids.join(","))}
          />
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
                    : field === "serviceCountryCodes"
                      ? values.servesWorldwide === "true"
                        ? t("worldwideLabel")
                        : (values.serviceCountryCodes ?? "")
                            .split(",")
                            .filter(Boolean)
                            .map(
                              (code) =>
                                countries.find((c) => c.code === code)?.name ??
                                code,
                            )
                            .join(", ") || t("notProvided")
                      : field === "registrationCountryCode"
                        ? countries.find(
                            (c) => c.code === values.registrationCountryCode,
                          )?.name || t("notProvided")
                        : (values[field] ?? "") || t("notProvided")}
                </dd>
              </div>
            ))}
            <div className="flex gap-4 p-3 text-sm">
              <dt className="w-1/3 text-muted-foreground">
                {tDashboard("onboardingMediaSection")}
              </dt>
              <dd className="w-2/3 flex flex-wrap items-center gap-2">
                {values.logoStaged === "true" && (
                  // eslint-disable-next-line @next/next/no-img-element -- own-origin staged preview (ADR 0024)
                  <img
                    src={draftMediaServePath(DRAFT_LOGO_SLOT)}
                    alt=""
                    className="size-10 border border-border object-cover"
                  />
                )}
                {stagedImageIds.map((id) => (
                  // eslint-disable-next-line @next/next/no-img-element -- own-origin staged preview (ADR 0024)
                  <img
                    key={id}
                    src={draftMediaServePath(id)}
                    alt=""
                    className="size-10 border border-border object-cover"
                  />
                ))}
                {values.logoStaged !== "true" &&
                  stagedImageIds.length === 0 && (
                    <span>{t("notProvided")}</span>
                  )}
              </dd>
            </div>
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
  "description",
  "specializationDescription",
  "businessCategoryIds",
  "registrationCountryCode",
  "serviceCountryCodes",
  "servesWorldwide",
  "businessFormat",
  "city",
  "discount",
  "contactEmail",
  "contactPhone",
  "logoStaged",
  "galleryImageIds",
] as const;

/** Review order. The label for each comes from the shared field-label map. */
const REVIEW_FIELDS = [
  "name",
  "legalName",
  "taxId",
  "website",
  "description",
  "specializationDescription",
  "discount",
  "contactEmail",
  "contactPhone",
  "businessCategoryIds",
  "businessFormat",
  "registrationCountryCode",
  "city",
  "serviceCountryCodes",
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

/**
 * Country of registration → city, picked from the provider's list for that
 * country (ADR 0025). With no lookup available the field is plain text - the
 * server validates city/country agreement either way (FR-041).
 */
function CityPicker({
  countryCode,
  value,
  onChange,
}: {
  countryCode: string;
  value: string;
  onChange: (city: string) => void;
}) {
  const t = useTranslations("company");
  const [cities, setCities] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!countryCode) {
      setCities(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void listCitiesForCountryAction(countryCode)
      .then((list) => {
        if (!cancelled) setCities(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [countryCode]);

  const query = value.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!cities || query.length === 0) return [];
    return cities
      .filter((city) => city.toLowerCase().includes(query))
      .slice(0, 12);
  }, [cities, query]);
  const exact = cities?.some((c) => c.toLowerCase() === query) ?? false;

  return (
    <Field id="city" label={t("cityLabel")}>
      <div className="relative">
        <Input
          id="city"
          value={value}
          placeholder={t("cityPlaceholder")}
          disabled={!countryCode}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          required
        />
        {open && suggestions.length > 0 && !exact && (
          <ul
            role="listbox"
            className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto border border-input bg-background text-sm shadow-md"
          >
            {suggestions.map((city) => (
              <li key={city} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left hover:bg-accent/10"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(city);
                    setOpen(false);
                  }}
                >
                  {city}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {loading
          ? t("cityLoading")
          : cities === null && countryCode
            ? t("cityFreeText")
            : cities && query && suggestions.length === 0 && !exact
              ? t("noCityMatches")
              : ""}
      </p>
    </Field>
  );
}

/**
 * Service countries as chips added from a type-ahead, unlimited in number.
 * "Worldwide" replaces the list; "same as registration" pins it to one.
 */
function ServiceCountriesPicker({
  countries,
  registrationCountryCode,
  codes,
  worldwide,
  onCodesChange,
  onWorldwideChange,
}: {
  countries: { code: string; name: string }[];
  registrationCountryCode: string;
  codes: string[];
  worldwide: boolean;
  onCodesChange: (codes: string[]) => void;
  onWorldwideChange: (worldwide: boolean) => void;
}) {
  const t = useTranslations("company");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const sameAsRegistration =
    Boolean(registrationCountryCode) &&
    codes.length === 1 &&
    codes[0] === registrationCountryCode;

  const q = query.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (q.length === 0) return [];
    return countries
      .filter(
        (c) => !codes.includes(c.code) && c.name.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [countries, codes, q]);

  const nameOf = (code: string) =>
    countries.find((c) => c.code === code)?.name ?? code;
  const locked = worldwide || sameAsRegistration;

  return (
    <Field id="serviceCountryCodes" label={t("serviceCountriesLabel")}>
      <div
        className={`space-y-3 border border-input bg-background p-3 ${locked ? "opacity-60" : ""}`}
      >
        <ul className="flex flex-wrap gap-2" aria-live="polite">
          {codes.length === 0 && (
            <li className="text-sm text-muted-foreground">
              {t("serviceCountriesEmpty")}
            </li>
          )}
          {codes.map((code) => (
            <li
              key={code}
              className="inline-flex items-center gap-1 border border-border px-2 py-1 text-xs font-bold uppercase tracking-[0.08em]"
            >
              {nameOf(code)}
              {!locked && (
                <button
                  type="button"
                  aria-label={t("removeCountry", { name: nameOf(code) })}
                  onClick={() => onCodesChange(codes.filter((c) => c !== code))}
                  className="ml-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="relative">
          <Input
            id="serviceCountryCodes"
            value={query}
            placeholder={t("serviceCountriesSearchPlaceholder")}
            disabled={locked}
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
          {open && suggestions.length > 0 && (
            <ul
              role="listbox"
              className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto border border-input bg-background text-sm shadow-md"
            >
              {suggestions.map((c) => (
                <li key={c.code} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left hover:bg-accent/10"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onCodesChange([...codes, c.code]);
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={worldwide}
          onChange={(e) => onWorldwideChange(e.target.checked)}
        />
        {t("worldwideLabel")}
      </label>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={sameAsRegistration}
          disabled={!registrationCountryCode || worldwide}
          onChange={(e) =>
            onCodesChange(e.target.checked ? [registrationCountryCode] : [])
          }
        />
        {t("serviceSameAsRegistration")}
      </label>
    </Field>
  );
}

function DraftLogoField({
  staged,
  onChange,
}: {
  staged: boolean;
  onChange: (staged: boolean) => void;
}) {
  const t = useTranslations("dashboard");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const report = (code: string | undefined) =>
    setError(
      code ? t(IMAGE_ERROR_KEYS[code] ?? "avatarErrorProcessingFailed") : null,
    );

  return (
    <div className="space-y-2">
      <Label htmlFor="draftLogo">{t("logoSectionLabel")}</Label>
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
      <div className="flex items-center gap-4">
        {staged ? (
          // eslint-disable-next-line @next/next/no-img-element -- own-origin staged preview (ADR 0024)
          <img
            src={`${draftMediaServePath(DRAFT_LOGO_SLOT)}?v=${version}`}
            alt=""
            className="size-16 border border-border object-cover"
          />
        ) : (
          <div
            className="flex size-16 items-center justify-center border border-border bg-muted text-[10px] uppercase tracking-wider text-muted-foreground"
            aria-hidden="true"
          >
            {t("noLogoYet")}
          </div>
        )}
        <div className="space-y-1">
          <input
            id="draftLogo"
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={busy}
            className={FILE_INPUT_CLASS}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              startTransition(async () => {
                const formData = new FormData();
                formData.set("logo", file);
                const result = await uploadDraftLogoAction(formData);
                report(result.success ? undefined : result.error);
                if (result.success) {
                  onChange(true);
                  setVersion((v) => v + 1);
                }
                if (fileRef.current) fileRef.current.value = "";
              });
            }}
          />
          <p className="text-xs text-muted-foreground">
            {busy ? t("galleryUploading") : t("logoHint")}
          </p>
          {staged && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                startTransition(async () => {
                  const result = await removeDraftLogoAction();
                  report(result.success ? undefined : result.error);
                  if (result.success) onChange(false);
                })
              }
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              {t("logoRemove")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftGalleryField({
  imageIds,
  onChange,
}: {
  imageIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const t = useTranslations("dashboard");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const report = (code: string | undefined) =>
    setError(
      code ? t(IMAGE_ERROR_KEYS[code] ?? "avatarErrorProcessingFailed") : null,
    );

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <Label htmlFor="draftImage">{t("galleryLabel")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("galleryCount", {
            count: imageIds.length,
            max: COMPANY_GALLERY_MAX_IMAGES,
          })}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
      {imageIds.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {imageIds.map((id) => (
            <li key={id} className="group relative aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element -- own-origin staged preview (ADR 0024) */}
              <img
                src={draftMediaServePath(id)}
                alt=""
                className="size-full rounded-sm object-cover"
              />
              <button
                type="button"
                disabled={busy}
                aria-label={t("galleryDelete")}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteDraftImageAction(id);
                    report(result.success ? undefined : result.error);
                    if (result.success)
                      onChange(imageIds.filter((x) => x !== id));
                  })
                }
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {imageIds.length < COMPANY_GALLERY_MAX_IMAGES && (
        <div className="space-y-1">
          <input
            id="draftImage"
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={busy}
            className={FILE_INPUT_CLASS}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              startTransition(async () => {
                const formData = new FormData();
                formData.set("image", file);
                const result = await uploadDraftImageAction(formData);
                report(result.success ? undefined : result.error);
                if (result.success && result.imageId) {
                  onChange([...imageIds, result.imageId]);
                }
                if (fileRef.current) fileRef.current.value = "";
              });
            }}
          />
          <p className="text-xs text-muted-foreground">
            {busy
              ? t("galleryUploading")
              : t("galleryHint", { max: COMPANY_GALLERY_MAX_IMAGES })}
          </p>
        </div>
      )}
    </div>
  );
}
