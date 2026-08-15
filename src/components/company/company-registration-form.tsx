"use client";

import { useState, useEffect, useActionState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  registerCompanyAction,
  saveCompanyDraftAction,
  getCompanyDraftAction,
  getBlocksAction,
  getCategoriesByBlockAction,
  getSubcategoriesByCategoryAction,
} from "@/actions/company";
import {
  COMPANY_FORM_STEPS,
  COMPANY_STEP_SCHEMAS,
  type CompanyStepNumber,
} from "@/lib/company-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
  1: ["name", "legalName", "taxId", "website", "logoUrl", "description"],
  2: ["block", "category", "businessCategoryId", "country", "city"],
  3: ["discount", "contactEmail", "contactPhone"],
};

export function CompanyRegistrationForm() {
  const t = useTranslations("company");
  const [state, action, pending] = useActionState(registerCompanyAction, null);

  const [step, setStep] = useState<CompanyStepNumber>(1);
  const [values, setValues] = useState<FormValues>({});
  const [stepError, setStepError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const [blocks, setBlocks] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<
    { id: number; subcategory: string }[]
  >([]);

  const selectedBlock = values.block ?? "";
  const selectedCategory = values.category ?? "";
  const selectedSubcategory = values.businessCategoryId ?? "";

  const set = (field: string, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  // Resume an unfinished application before anything else is touched.
  useEffect(() => {
    void getCompanyDraftAction()
      .then((draft) => {
        if (draft) {
          setValues(
            Object.fromEntries(
              Object.entries(draft.data)
                .filter(([, value]) => value !== undefined && value !== null)
                .map(([key, value]) => [key, String(value)]),
            ),
          );
          setStep(draft.step);
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    void getBlocksAction().then(setBlocks);
  }, []);

  useEffect(() => {
    if (!selectedBlock) {
      setCategories([]);
      return;
    }
    void getCategoriesByBlockAction(selectedBlock).then(setCategories);
  }, [selectedBlock]);

  useEffect(() => {
    if (!selectedBlock || !selectedCategory) {
      setSubcategories([]);
      return;
    }
    void getSubcategoriesByCategoryAction(selectedBlock, selectedCategory).then(
      setSubcategories,
    );
  }, [selectedBlock, selectedCategory]);

  async function goNext() {
    setStepError(null);

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
        setStepError(parsed.error.issues[0]?.message ?? null);
        return;
      }
    }

    setSaving(true);
    const saved = await saveCompanyDraftAction(step, stepValues);
    setSaving(false);

    if (!saved.success) {
      setStepError(saved.error ?? null);
      return;
    }

    setStep((current) =>
      current < COMPANY_FORM_STEPS
        ? ((current + 1) as CompanyStepNumber)
        : current,
    );
  }

  function goBack() {
    setStepError(null);
    setStep((current) =>
      current > 1 ? ((current - 1) as CompanyStepNumber) : current,
    );
  }

  if (state?.success) {
    return (
      <div className="text-sm text-green-500 bg-green-500/10 p-4 rounded-none border border-green-500/20">
        <p className="font-bold mb-2">{t("successTitle")}</p>
        <Link
          href="/dashboard/profile"
          className="underline hover:text-green-400"
        >
          {t("returnToProfile")}
        </Link>
      </div>
    );
  }

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

      {(stepError ?? state?.error) && (
        <p
          role="alert"
          className="text-sm text-red-500 bg-red-500/10 p-3 rounded-none border border-red-500/20"
        >
          {stepError ?? state?.error}
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
                  businessCategoryId: "",
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
                  businessCategoryId: "",
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

          <Field id="businessCategoryId" label={t("subcategoryLabel")}>
            <select
              id="businessCategoryId"
              className={SELECT_CLASS}
              value={selectedSubcategory}
              disabled={!selectedCategory}
              onChange={(e) => set("businessCategoryId", e.target.value)}
              required
            >
              <option value="">{t("subcategoryPlaceholder")}</option>
              {subcategories.map((sc) => (
                <option key={sc.id} value={String(sc.id)}>
                  {sc.subcategory}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field id="country" label={t("countryLabel")}>
              <Input
                id="country"
                value={values.country ?? ""}
                placeholder={t("countryPlaceholder")}
                onChange={(e) => set("country", e.target.value)}
                required
              />
            </Field>
            <Field id="city" label={t("cityLabel")}>
              <Input
                id="city"
                value={values.city ?? ""}
                placeholder={t("cityPlaceholder")}
                onChange={(e) => set("city", e.target.value)}
                required
              />
            </Field>
          </div>
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
            {REVIEW_FIELDS.map(([field, labelKey]) => (
              <div key={field} className="flex gap-4 p-3 text-sm">
                <dt className="w-1/3 text-muted-foreground">{t(labelKey)}</dt>
                <dd className="w-2/3 break-words">
                  {field === "businessCategoryId"
                    ? (subcategories.find(
                        (sc) => String(sc.id) === selectedSubcategory,
                      )?.subcategory ?? t("notProvided"))
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
  "businessCategoryId",
  "country",
  "city",
  "discount",
  "contactEmail",
  "contactPhone",
] as const;

const REVIEW_FIELDS: [string, string][] = [
  ["name", "nameLabel"],
  ["legalName", "legalNameLabel"],
  ["taxId", "taxIdLabel"],
  ["website", "websiteLabel"],
  ["description", "descriptionLabel"],
  ["businessCategoryId", "subcategoryLabel"],
  ["country", "countryLabel"],
  ["city", "cityLabel"],
  ["discount", "discountLabel"],
  ["contactEmail", "contactEmailLabel"],
  ["contactPhone", "contactPhoneLabel"],
];

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
