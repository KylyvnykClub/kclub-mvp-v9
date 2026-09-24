"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import {
  registerCompanyAction,
  saveCompanyDraftAction,
  getCompanyDraftAction,
} from "@/actions/company";
import {
  COMPANY_FIELD_LABEL_KEYS,
  describeCompanyIssue,
  registerCompanySchema,
  type CompanyFormIssue,
} from "@/lib/company-form";
import { Button } from "@/components/ui/button";
import {
  CompanyFields,
  SectionHeading,
  type CompanyFormValues,
} from "./company-fields";
import { DraftGalleryField, DraftLogoField } from "./company-draft-media";
import { parseDraftImageIds } from "@/lib/draft-media-path";

/**
 * The company submission form for a member who is already in the club
 * (FR-040), on one page.
 *
 * It used to be four steps with a review panel at the end. The steps bought a
 * shorter screen and cost an applicant four chances to stop: every "next" was
 * a decision to continue, and the review panel restated eighteen answers that
 * were still on screen a moment earlier. One page asks the same questions in
 * the same order the shared `CompanyFields` asks them everywhere else — what
 * the business *is* before what it says about itself (FR-109).
 *
 * The draft survives the change and does more than it did: instead of being
 * written when a step is completed, it is written a second after the applicant
 * stops typing, so a closed tab costs nothing at any point rather than only at
 * the four boundaries.
 *
 * Nothing here opens checkout. Since ADR 0036 a listing is paid for after the
 * application has been approved, from the screen that announces the approval —
 * an applicant is never charged for a listing that moderation may refuse.
 */

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

const DRAFT_SAVE_DELAY_MS = 1000;

export function CompanyRegistrationForm() {
  const t = useTranslations("company");
  const tDashboard = useTranslations("dashboard");

  const [values, setValues] = useState<CompanyFormValues>({
    servesWorldwide: "false",
  });
  const [hydrated, setHydrated] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);

  const [state, action, pending] = useActionState(
    async (_previous: FormState, formData: FormData): Promise<FormState> => {
      // The same schema the Server Action parses with, so a submission cannot
      // pass here and fail on the wire (CLAUDE.md). It also means the message
      // names the field without a round trip.
      const parsed = registerCompanySchema.safeParse(
        Object.fromEntries(formData.entries()),
      );
      if (!parsed.success) {
        return { success: false, issue: describeCompanyIssue(parsed.error) };
      }

      return registerCompanyAction(null, formData);
    },
    null,
  );

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
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  // Autosave. A step boundary used to be the only moment progress was kept;
  // with one page there are no boundaries, so the pause after typing is it.
  const saved = useRef<string>("");
  useEffect(() => {
    if (!hydrated || state?.success) return;

    const serialised = JSON.stringify(values);
    if (serialised === saved.current) return;

    const timer = setTimeout(() => {
      saved.current = serialised;
      setDraftSaving(true);
      void saveCompanyDraftAction(values).finally(() => setDraftSaving(false));
    }, DRAFT_SAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [values, hydrated, state?.success]);

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

  if (state?.success) {
    return (
      <div className="space-y-4 border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-500">
        <p className="font-bold">{t("successTitle")}</p>
        {/* ADR 0036: nothing to pay yet, and saying so is the point. */}
        <p className="text-muted-foreground">{t("reviewHandoff")}</p>
        <Link
          href="/dashboard/profile"
          className="inline-block underline hover:text-green-400"
        >
          {t("returnToProfile")}
        </Link>
      </div>
    );
  }

  if (!hydrated) {
    return <p className="text-sm text-muted-foreground">{t("draftLoading")}</p>;
  }

  const issue = state?.issue ?? null;
  const stagedImageIds = parseDraftImageIds(values.galleryImageIds);

  return (
    <form action={action} className="space-y-8">
      {issue && (
        <p
          role="alert"
          className="text-sm text-red-500 bg-red-500/10 p-3 rounded-md border border-red-500/20"
        >
          {issueMessage(issue)}
        </p>
      )}

      <CompanyFields values={values} setValues={setValues} />

      <section className="space-y-4">
        <SectionHeading>{tDashboard("onboardingMediaSection")}</SectionHeading>
        <p className="text-sm text-muted-foreground">
          {tDashboard("onboardingMediaNote")}
        </p>

        <DraftLogoField
          staged={values.logoStaged === "true"}
          onChange={(staged) =>
            setValues((current) => ({
              ...current,
              logoStaged: staged ? "true" : "",
            }))
          }
        />

        <DraftGalleryField
          imageIds={stagedImageIds}
          onChange={(ids) =>
            setValues((current) => ({
              ...current,
              galleryImageIds: ids.join(","),
            }))
          }
        />
      </section>

      {SUBMITTED_FIELDS.map((field) => (
        <input
          key={field}
          type="hidden"
          name={field}
          value={values[field] ?? ""}
        />
      ))}

      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("reviewNote")}</p>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? t("submitting") : t("submit")}
        </Button>
        <p
          className="text-xs text-muted-foreground"
          aria-live="polite"
          role="status"
        >
          {draftSaving ? t("draftSaving") : t("draftKept")}
        </p>
      </div>
    </form>
  );
}

type FormState = {
  success: boolean;
  issue?: CompanyFormIssue;
  companyId?: string;
} | null;
