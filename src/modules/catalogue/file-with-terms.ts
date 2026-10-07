import { applyPartnerLinkWaiver } from "./partner-link-waiver";
import {
  consentsComplete,
  RENDERED_WORDING_FIELD,
  resolveApplication,
  settleFiledApplication,
  tickedConsents,
} from "./application-consents";
import { sendApplicationConfirmation } from "./application-confirmation";
import { submitCompany } from "./submit-company";
import { db } from "@/data/db";
import type { CompanyFormIssue } from "@/lib/company-form";
import { logger } from "@/lib/logger";

/**
 * A plain module, not part of a `"use server"` file: it takes the owner from
 * its caller, and every export of a server-action file is a public endpoint.
 * Both callers authorise first and pass a member they already trust.
 */

export type FiledApplication = {
  success: boolean;
  companyId?: string;
  issue?: CompanyFormIssue;
};

/**
 * The terms half of filing, shared with the dashboard form: decide the terms
 * on the server, refuse if they are not the ones the form showed or a box is
 * missing, file the company, then record the consents, spend the invitation
 * and create the activation together. The club's partner link (ADR 0040) is
 * applied last, only when the terms said the listing is free.
 */
export async function fileWithTerms(
  owner: {
    id: string;
    country: string | null;
    language: string | null;
    email: string | null;
  },
  formData: FormData,
): Promise<FiledApplication> {
  const now = new Date();
  const ticked = tickedConsents(formData);
  const resolved = await resolveApplication(
    db,
    owner,
    ticked.has("eu_early_start"),
    now,
  );

  if ((resolved.wording ?? "none") !== formData.get(RENDERED_WORDING_FIELD)) {
    return { success: false, issue: { code: "termsChanged" } };
  }
  if (!consentsComplete(formData, resolved.wording !== null)) {
    return { success: false, issue: { code: "consentsRequired" } };
  }

  const result = await submitCompany(db, owner.id, formData);
  if (!result.success || !result.companyId) return result;

  const locale = owner.language ?? "en";
  try {
    await settleFiledApplication(db, {
      memberId: owner.id,
      companyId: result.companyId,
      residenceCountry: owner.country,
      locale,
      ticked,
      resolved,
      now,
    });
  } catch (error) {
    // The company exists without its terms. The checkout refuses it (no
    // payment authority on record) and the standing screen asks again.
    logger.error("Could not record the application terms", {
      companyId: result.companyId,
      error: error instanceof Error ? error.message : String(error),
    });
    return result;
  }

  if (resolved.terms.collection === "none") {
    await applyPartnerLinkWaiver(db, owner.id, result.companyId);
  }

  await sendApplicationConfirmation({
    to: owner.email,
    locale,
    companyId: result.companyId,
    resolved,
    ticked,
  });

  return result;
}
