"use server";

import { redirect } from "next/navigation";

import { db } from "@/data/db";
import { findMemberById } from "@/data/identity";
import { ownsLiveApplication } from "@/data/membership-access";
import { buildActor } from "@/domain/actor";
import { assertCan } from "@/domain/authorization";
import type { RegisterErrorCode } from "@/domain/registration";
import {
  describeCompanyIssue,
  submitCompanySchema,
  type CompanyFormIssue,
} from "@/lib/company-form";
import {
  registerMemberFromForm,
  type RegisterField,
} from "@/modules/identity/registration-form";
import { attachApplicationMedia } from "@/modules/catalogue/attach-application-media";
import {
  consentsComplete,
  RENDERED_WORDING_FIELD,
} from "@/modules/catalogue/application-consents";
import { fileWithTerms } from "@/modules/catalogue/file-with-terms";
import { holdCheckoutUrlOrNull } from "@/modules/billing/listing-hold-checkout";
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
 * Nothing is charged. A successful submit goes straight on to Stripe - to
 * reserve the listing price on the card (ADR 0037, FR-113), captured only
 * when a moderator approves, or to save the card for a free month or a
 * deferred start (ADR 0044). Neither opens without the consents: the three
 * required boxes are checked before an account exists, and the payment
 * authority is checked again by the checkout itself.
 */

export type PartnerApplicationState = {
  success: boolean;
  companyId?: string;
  /** A refusal about the account half, as a `register.error.*` key. */
  accountError?: RegisterErrorCode;
  /** The identifier box the account refusal belongs against. */
  accountField?: RegisterField | null;
  /** A refusal about the business half. */
  issue?: CompanyFormIssue;
} | null;

export async function registerPartnerAction(
  _previous: PartnerApplicationState,
  formData: FormData,
): Promise<PartnerApplicationState> {
  // The logo rides with the submit (see the form); whether one arrived is
  // read from the request itself, not from a field the browser could set.
  const logoFile = formData.get("logoFile");
  formData.set(
    "logoAttached",
    logoFile instanceof File && logoFile.size > 0 ? "true" : "",
  );

  // Somebody already signed in is filing an application, not registering. This
  // is the path a partner takes whose account exists because an earlier
  // attempt created it and then the application half failed.
  const auth = await getCurrentMember();
  if (auth?.member) {
    const actor = buildActor(auth.member);
    assertCan(actor, "create", "own_company");

    // One live application at a time; a rejected one may be followed by
    // another.
    if (await ownsLiveApplication(db, auth.member.id)) {
      return { success: false, issue: { code: "unauthorized" } };
    }

    return fileApplication(auth.member.id, formData);
  }

  // ADR 0044: the boxes come first, before an account exists - an applicant
  // who has not agreed must not end up with an account they did not finish.
  // Whether payment authority is needed follows the wording the form showed;
  // the server decides the real terms again once the account exists.
  const renderedWording = formData.get(RENDERED_WORDING_FIELD);
  if (!consentsComplete(formData, renderedWording !== "none")) {
    return { success: false, issue: { code: "consentsRequired" } };
  }

  // Shape first, before an account exists. `submitCompany` would reject the
  // same submission a moment later, but by then the account would be real and
  // the applicant would own a membership they did not ask for. The checks that
  // need the database - the category is known and permitted, the city belongs
  // to the country - still run inside it, and a failure there leaves an
  // account that this action's signed-in branch lets them finish from.
  const shape = submitCompanySchema.safeParse(
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
  // The owner is read by id: a session created by this same request is not
  // on the request yet.
  const owner = await findMemberById(db, ownerId);
  if (!owner) return { success: false, issue: { code: "unauthorized" } };

  const outcome = await fileWithTerms(owner, formData);
  if (!outcome.success || !outcome.companyId) return outcome;

  await attachApplicationMedia(db, outcome.companyId, formData);

  // Straight on to Stripe (ADR 0037, ADR 0044) - or, with nothing to pay, to
  // the standing screen.
  const next = await holdCheckoutUrlOrNull(owner, outcome.companyId);
  if (next) redirect(next);

  return outcome;
}
