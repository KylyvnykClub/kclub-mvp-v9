"use server";

import { db } from "@/data/db";
import { listCompaniesByOwner } from "@/data/companies";
import { buildActor } from "@/domain/actor";
import { assertCan } from "@/domain/authorization";
import type { RegisterErrorCode } from "@/domain/registration";
import {
  describeCompanyIssue,
  registerCompanySchema,
  type CompanyFormIssue,
} from "@/lib/company-form";
import { registerMemberFromForm } from "@/modules/identity/registration-form";
import { attachApplicationMedia } from "@/modules/catalogue/attach-application-media";
import { submitCompany } from "@/modules/catalogue/submit-company";
import { getCurrentMember } from "./session";

/**
 * Business partner registration, on one page (FR-109).
 *
 * One submit creates the account and files the application. It is one act as
 * far as the applicant is concerned — they are not joining a club, they are
 * asking to be listed — and splitting it into "register, then find the form
 * again" is what sent a business arriving from the landing page into the
 * member sign-up and lost them there.
 *
 * Nothing is charged. The application goes to moderation and the listing is
 * paid for after it is approved (ADR 0036, FR-111), which is why this action
 * has no Stripe call in it and returns no checkout url.
 */

export type PartnerApplicationState = {
  success: boolean;
  companyId?: string;
  /** A refusal about the account half, as a `register.error.*` key. */
  accountError?: RegisterErrorCode;
  /** The identifier box the account refusal belongs against. */
  accountField?: "phone" | "email" | null;
  /** A refusal about the business half. */
  issue?: CompanyFormIssue;
} | null;

export async function registerPartnerAction(
  _previous: PartnerApplicationState,
  formData: FormData,
): Promise<PartnerApplicationState> {
  // Somebody already signed in is filing an application, not registering. This
  // is the path a partner takes whose account exists because an earlier
  // attempt created it and then the application half failed.
  const auth = await getCurrentMember();
  if (auth?.member) {
    const actor = buildActor(auth.member);
    assertCan(actor, "create", "own_company");

    const existing = await listCompaniesByOwner(db, auth.member.id);
    if (existing.length > 0) {
      return { success: false, issue: { code: "unauthorized" } };
    }

    return fileApplication(auth.member.id, formData);
  }

  // Shape first, before an account exists. `submitCompany` would reject the
  // same submission a moment later, but by then the account would be real and
  // the applicant would own a membership they did not ask for. The checks that
  // need the database - the category is known and permitted, the city belongs
  // to the country - still run inside it, and a failure there leaves an
  // account that this action's signed-in branch lets them finish from.
  const shape = registerCompanySchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!shape.success) {
    return { success: false, issue: describeCompanyIssue(shape.error) };
  }

  const account = await registerMemberFromForm(formData, {
    duesKind: "partner",
  });

  if (!account.success) {
    return {
      success: false,
      accountError: account.error,
      accountField: account.field,
    };
  }

  return fileApplication(account.memberId, formData);
}

/**
 * The application and the pictures that came with it, in one request.
 *
 * Media is attached here rather than from the browser afterwards: this
 * action's response re-renders `/partner`, which sends an applicant who now
 * has an application to their standing screen, so anything left running in the
 * client is racing a navigation.
 */
async function fileApplication(
  ownerId: string,
  formData: FormData,
): Promise<PartnerApplicationState> {
  const result = await submitCompany(db, ownerId, formData);

  if (result.success && result.companyId) {
    await attachApplicationMedia(db, result.companyId, formData);
  }

  return result;
}
