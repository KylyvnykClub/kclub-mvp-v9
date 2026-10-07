import { findCompanyById } from "@/data/companies";
import { db } from "@/data/db";
import type { ConsentKind } from "@/domain/business-application";
import { logger } from "@/lib/logger";
import { safeErrorFields } from "@/lib/safe-error";
import {
  consentTexts,
  disclosureLines,
  type ResolvedApplication,
} from "./application-consents";

/**
 * The confirmation of terms at application (ADR 0044 §6): the disclosure the
 * applicant saw and the text of every box they ticked, by email, for their
 * records. Never throws - the application stands whether or not the email
 * goes; the consent records are the evidence, the email is the courtesy.
 */
export async function sendApplicationConfirmation(input: {
  to: string | null;
  locale: string;
  companyId: string;
  resolved: ResolvedApplication;
  ticked: ReadonlySet<ConsentKind>;
}): Promise<void> {
  if (!input.to) return;
  const locale =
    input.locale === "ru" || input.locale === "uk" ? input.locale : "en";

  try {
    const [company, disclosure, texts] = await Promise.all([
      findCompanyById(db, input.companyId),
      disclosureLines(locale, input.resolved.wording),
      consentTexts(locale, input.resolved.wording),
    ]);
    if (!company) return;

    const order: ConsentKind[] = [
      "terms",
      "payment_authority",
      "publication",
      "marketing",
      "eu_early_start",
    ];
    const consents = order
      .filter((kind) => input.ticked.has(kind) && texts[kind])
      .filter(
        (kind) => kind !== "eu_early_start" || input.resolved.terms.euConsumer,
      )
      .map((kind) => texts[kind]);

    const { sendApplicationTermsEmail } =
      await import("@/modules/notifications/listing-emails");
    await sendApplicationTermsEmail({
      to: input.to,
      locale,
      companyName: company.name,
      disclosure,
      consents,
    });
  } catch (error) {
    logger.error("Could not send the application confirmation", {
      companyId: input.companyId,
      ...safeErrorFields(error),
    });
  }
}
