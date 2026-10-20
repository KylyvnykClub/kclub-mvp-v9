"use client";

// Client: the application's own field set is a stateful form (category
// cascade, city lookup, country picker), reused here prefilled.
import { startTransition, useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import {
  getLocalizedCategoryTreeAction,
  ownerEditCompanyAction,
  type CompanyEditState,
} from "@/actions/company";
import type { Locale } from "@/i18n/routing";
import {
  CompanyFields,
  type CompanyFormValues,
} from "@/components/company/company-fields";
import { Button } from "@/components/ui/button";
import type { CompanyRow } from "@/data/companies";
import {
  COMPANY_FIELD_LABEL_KEYS,
  type CompanyFormIssue,
} from "@/lib/company-form";

/** What the form posts: the application's fields, without the media. */
const SUBMITTED_FIELDS = [
  "name",
  "legalName",
  "taxId",
  "website",
  "description",
  "descriptionEn",
  "descriptionUk",
  "descriptionRu",
  "specializationDescription",
  "businessCategoryIds",
  "registrationCountryCode",
  "serviceCountryCodes",
  "servesWorldwide",
  "businessFormat",
  "city",
  "administrativeLevel1",
  "administrativeLevel2",
  "discount",
  "specialPrivileges",
  "specialPrivilegesNote",
  "contactEmail",
  "contactPhone",
] as const;

/** The live company as the form's string values (ADR 0051). */
export function companyFormValuesOf(company: CompanyRow): CompanyFormValues {
  // The block and category selects show names in the reader's language, so
  // they are filled from the localized tree once it loads (see the effect).
  return {
    block: "",
    category: "",
    businessCategoryIds: company.categories
      .map((c) => c.businessCategoryId)
      .join(","),
    name: company.name,
    legalName: company.legalName ?? "",
    taxId: company.taxId ?? "",
    website: company.website ?? "",
    description: company.description ?? "",
    descriptionEn: company.descriptionTranslations?.en ?? "",
    descriptionUk: company.descriptionTranslations?.uk ?? "",
    descriptionRu: company.descriptionTranslations?.ru ?? "",
    specializationDescription: company.specializationDescription ?? "",
    discount: company.discount ?? "",
    specialPrivileges: company.specialPrivileges ? "true" : "false",
    specialPrivilegesNote: company.specialPrivilegesNote ?? "",
    contactEmail: company.contactEmail ?? "",
    contactPhone: company.contactPhone ?? "",
    businessFormat: company.businessFormat ?? "offline_only",
    registrationCountryCode: company.registrationCountryCode ?? "",
    city: company.city ?? "",
    administrativeLevel1: company.administrativeLevel1 ?? "",
    administrativeLevel2: company.administrativeLevel2 ?? "",
    serviceCountryCodes: company.serviceCountries
      .map((c) => c.countryCode)
      .join(","),
    servesWorldwide: company.servesWorldwide === 1 ? "true" : "false",
  };
}

/**
 * A partner edits every field of their company (FR-045, ADR 0051). On an
 * approved company the offer waits for a moderator while the live listing
 * stays as it is; contacts and the website change at once.
 */
export function CompanyEditForm({
  company,
  onDone,
}: {
  company: CompanyRow;
  onDone: () => void;
}) {
  const t = useTranslations("company");
  const tEdit = useTranslations("companyEdit");
  const router = useRouter();
  const locale = useLocale() as Locale;
  const [values, setValues] = useState<CompanyFormValues>(() =>
    companyFormValuesOf(company),
  );

  // The cascade above the subcategories keys on localized names: find the
  // company's first subcategory in the same tree the form loads, and open the
  // two selects on its block and category.
  const firstCategoryId = company.categories[0]?.businessCategoryId;
  useEffect(() => {
    if (firstCategoryId === undefined) return;
    void getLocalizedCategoryTreeAction(locale).then((tree) => {
      const row = tree.find((r) => r.id === firstCategoryId);
      if (!row) return;
      setValues((current) => ({
        ...current,
        block: current.block || row.block,
        category: current.category || row.category,
      }));
    });
  }, [firstCategoryId, locale]);
  const [state, action, pending] = useActionState(
    async (previous: CompanyEditState | null, formData: FormData) => {
      const result = await ownerEditCompanyAction(previous, formData);
      if (result.success) router.refresh();
      return result;
    },
    null,
  );

  function issueMessage(reported: CompanyFormIssue): string {
    const reason = t(`errors.${reported.code}`, { limit: reported.limit ?? 0 });
    const labelKey = reported.field
      ? COMPANY_FIELD_LABEL_KEYS[reported.field]
      : undefined;
    return labelKey
      ? t("errors.aboutField", { field: t(labelKey), reason })
      : reason;
  }

  return (
    // Submitted by hand rather than through `action`: React 19 resets a form
    // after its action returns, which drops every select back to its
    // placeholder while the state still holds the values (as in
    // company-registration-form).
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
      className="space-y-6 border-t border-border pt-6"
    >
      <p className="text-sm text-muted-foreground">
        {company.moderationStatus === "approved"
          ? tEdit("hintApproved")
          : tEdit("hintPending")}
      </p>

      <CompanyFields values={values} setValues={setValues} />

      <input type="hidden" name="companyId" value={company.id} />
      {SUBMITTED_FIELDS.map((field) => (
        <input
          key={field}
          type="hidden"
          name={field}
          value={values[field] ?? ""}
        />
      ))}

      {state && !state.success && (
        <p
          role="alert"
          className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500"
        >
          {issueMessage(state.issue)}
        </p>
      )}
      {state?.success && (
        <p role="status" className="text-sm text-foreground">
          {tEdit(`outcome.${state.outcome}`)}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? tEdit("saving") : tEdit("save")}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {tEdit("close")}
        </Button>
      </div>
    </form>
  );
}
