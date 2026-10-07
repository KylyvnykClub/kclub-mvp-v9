"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentMember } from "./session";
import { appendAuditEntry } from "@/data/audit-log";
import {
  findPaymentAuthority,
  hasPaymentAuthority,
  insertConsentRecords,
  withdrawCompany,
} from "@/data/business-applications";
import { findCompanyByOwner } from "@/data/companies";
import { db } from "@/data/db";
import { BILLING_REFUND_RETRY_TOPIC, enqueueOutbox } from "@/data/outbox";
import { buildActor } from "@/domain/actor";
import { assertCan } from "@/domain/authorization";
import {
  CONSENT_TEXT_VERSION,
  isEuEeaResident,
  withdrawalWindowOpen,
} from "@/domain/business-application";
import { logger } from "@/lib/logger";
import { safeErrorFields } from "@/lib/safe-error";
import {
  cancelListingRenewal,
  productionListingCancellationDeps,
} from "@/modules/billing/listing-cancellation";
import {
  LISTING_HOLD_SETTLE_TOPIC,
  productionListingHoldDeps,
  refundCapturedListingHolds,
  settleListingHolds,
} from "@/modules/billing/listing-hold";
import { listingHoldCheckoutUrl } from "@/modules/billing/listing-hold-checkout";
import {
  productionRefundDeps,
  refundListingForCompany,
} from "@/modules/billing/refund";
import {
  RENDERED_WORDING_FIELD,
  consentsComplete,
  resolveApplication,
  settleFiledApplication,
  tickedConsents,
} from "@/modules/catalogue/application-consents";

/**
 * The partner's own ways out (ADR 0044 §4, §5), and the consents an
 * application filed before ADR 0044 still needs. Each is a public endpoint:
 * the id is parsed, the actor authorised, and the company read back by owner
 * before anything is done.
 */

const companyIdSchema = z.string().uuid();

type Result =
  { success: true; endsAt?: string } | { success: false; error: string };

async function ownedCompany(companyId: string) {
  const auth = await getCurrentMember();
  if (!auth?.member) return null;
  assertCan(buildActor(auth.member), "update", "own_company");
  if (!companyIdSchema.safeParse(companyId).success) return null;
  const company = await findCompanyByOwner(db, companyId, auth.member.id);
  return company ? { member: auth.member, company } : null;
}

function localeOf(language: string | null | undefined): "en" | "ru" | "uk" {
  return language === "ru" || language === "uk" ? language : "en";
}

/** Before approval: the application is withdrawn and any hold released. */
export async function withdrawApplicationAction(
  companyId: string,
): Promise<Result> {
  const owned = await ownedCompany(companyId);
  if (!owned) return { success: false, error: "not_found" };
  const { member, company } = owned;

  const withdrawn = await withdrawCompany(db, {
    companyId: company.id,
    ownerId: member.id,
    now: new Date(),
    pendingOnly: true,
    reason: "Withdrawn by the applicant",
  });
  if (!withdrawn) return { success: false, error: "not_withdrawable" };

  await appendAuditEntry(db, {
    actorType: "member",
    actorId: member.id,
    action: "company.application_withdrawn",
    subjectType: "company",
    subjectId: company.id,
    meta: {},
  });

  // A rejected company's hold is released by the ordinary settlement.
  try {
    await settleListingHolds(
      db,
      await productionListingHoldDeps(),
      company.id,
      new Date(),
    );
  } catch (error) {
    logger.error("Could not release the hold of a withdrawn application", {
      companyId: company.id,
      ...safeErrorFields(error),
    });
    await enqueueOutbox(db, LISTING_HOLD_SETTLE_TOPIC, {
      companyId: company.id,
    });
  }

  revalidatePath("/membership");
  revalidatePath("/dashboard/profile");
  return { success: true };
}

/**
 * "Cancel auto-renewal": the visible button the specification asks for, with
 * no call, manager or survey in the way. Ends at the period end - the free
 * month's end in a trial, with no invoice.
 */
export async function cancelListingRenewalAction(
  companyId: string,
): Promise<Result> {
  const owned = await ownedCompany(companyId);
  if (!owned) return { success: false, error: "not_found" };
  const { member, company } = owned;

  let outcome;
  try {
    outcome = await cancelListingRenewal(
      db,
      await productionListingCancellationDeps(),
      company.id,
    );
  } catch (error) {
    logger.error("Could not cancel the listing renewal", {
      companyId: company.id,
      ...safeErrorFields(error),
    });
    // Said plainly rather than queued silently: the partner must know the
    // renewal is not yet cancelled, and can press again.
    return { success: false, error: "stripe_unavailable" };
  }

  if (outcome.outcome === "nothing_to_cancel") {
    return { success: false, error: "nothing_to_cancel" };
  }

  if (outcome.outcome === "cancelled") {
    await appendAuditEntry(db, {
      actorType: "member",
      actorId: member.id,
      action: "company.listing_renewal_cancelled",
      subjectType: "company",
      subjectId: company.id,
      meta: {
        subscriptionId: outcome.subscriptionId,
        endsAt: outcome.endsAt.toISOString(),
      },
    });

    const to = member.email ?? company.contactEmail;
    if (to) {
      try {
        const { sendRenewalCancelledEmail } =
          await import("@/modules/notifications/listing-emails");
        await sendRenewalCancelledEmail({
          to,
          locale: localeOf(member.language),
          companyName: company.name,
          endsAt: outcome.endsAt,
        });
      } catch (error) {
        logger.error("Could not send the renewal cancellation email", {
          companyId: company.id,
          ...safeErrorFields(error),
        });
      }
    }
  }

  revalidatePath("/membership");
  revalidatePath("/dashboard/profile");
  return { success: true, endsAt: outcome.endsAt.toISOString() };
}

/**
 * The EU/EEA right of withdrawal (ADR 0044 §5): within 14 days of the
 * consent, for a resident of the EU/EEA. The listing ends at once, the
 * subscription is cancelled with no final invoice, a hold is released and
 * anything captured or invoiced is refunded in full. Confirmed on screen and
 * by email, and recorded beside the consents.
 */
export async function withdrawFromContractAction(
  companyId: string,
): Promise<Result> {
  const owned = await ownedCompany(companyId);
  if (!owned) return { success: false, error: "not_found" };
  const { member, company } = owned;
  const now = new Date();

  const consent = await findPaymentAuthority(db, company.id);
  if (
    !consent ||
    !isEuEeaResident(consent.residenceCountry) ||
    !withdrawalWindowOpen(consent.acceptedAt, now)
  ) {
    return { success: false, error: "window_closed" };
  }

  const withdrawn = await withdrawCompany(db, {
    companyId: company.id,
    ownerId: member.id,
    now,
    pendingOnly: false,
    reason: "Withdrawn under the EU right of withdrawal",
  });
  if (!withdrawn) return { success: false, error: "already_withdrawn" };

  const locale = localeOf(member.language);
  const evidence = {
    en: "I withdraw from the contract for this business listing under the 14-day right of withdrawal.",
    ru: "Я отказываюсь от договора о размещении этого бизнеса в рамках 14-дневного права отказа.",
    uk: "Я відмовляюся від договору про розміщення цього бізнесу в межах 14-денного права відмови.",
  }[locale];
  const { createHash } = await import("node:crypto");
  await insertConsentRecords(db, [
    {
      memberId: member.id,
      companyId: company.id,
      kind: "eu_withdrawal",
      route: consent.route,
      wording: null,
      textVersion: CONSENT_TEXT_VERSION,
      textHash: createHash("sha256").update(evidence).digest("hex"),
      text: evidence,
      locale,
      residenceCountry: consent.residenceCountry,
      inviteLinkId: consent.inviteLinkId,
      ipAddress: null,
      userAgent: null,
      acceptedAt: now,
    },
  ]);

  await appendAuditEntry(db, {
    actorType: "member",
    actorId: member.id,
    action: "company.contract_withdrawn",
    subjectType: "company",
    subjectId: company.id,
    meta: { consentAcceptedAt: consent.acceptedAt.toISOString() },
  });

  // The money half, through the paths a rejection already uses, keyed so a
  // retry refunds nothing twice. Stripe unreachable: the same retry topics
  // pick it up, and they re-read that the company is still rejected.
  let refunded = false;
  try {
    const listingHold = await productionListingHoldDeps();
    const holds = await refundCapturedListingHolds(
      db,
      listingHold,
      company.id,
      now,
    );
    const invoice = await refundListingForCompany(
      db,
      await productionRefundDeps(),
      company.id,
    );
    await settleListingHolds(db, listingHold, company.id, now);
    refunded = holds.length > 0 || invoice.outcome === "refunded";
  } catch (error) {
    logger.error("Could not settle the money of an EU withdrawal", {
      companyId: company.id,
      ...safeErrorFields(error),
    });
    await enqueueOutbox(db, BILLING_REFUND_RETRY_TOPIC, {
      companyId: company.id,
    });
    await enqueueOutbox(db, LISTING_HOLD_SETTLE_TOPIC, {
      companyId: company.id,
    });
    refunded = true;
  }

  const to = member.email ?? company.contactEmail;
  if (to) {
    try {
      const { sendWithdrawalConfirmedEmail } =
        await import("@/modules/notifications/listing-emails");
      await sendWithdrawalConfirmedEmail({
        to,
        locale,
        companyName: company.name,
        withdrawnAt: now,
        refunded,
      });
    } catch (error) {
      logger.error("Could not send the withdrawal confirmation", {
        companyId: company.id,
        ...safeErrorFields(error),
      });
    }
  }

  revalidatePath("/membership");
  revalidatePath("/dashboard/profile");
  revalidatePath("/directory");
  return { success: true };
}

/**
 * The consents for an application filed before ADR 0044, which has none on
 * record and so cannot open Stripe. The same boxes, the same server-decided
 * terms and records as a new application; then straight on to Stripe.
 */
export async function confirmListingConsentsAction(
  companyId: string,
  formData: FormData,
): Promise<Result> {
  const owned = await ownedCompany(companyId);
  if (!owned) return { success: false, error: "not_found" };
  const { member, company } = owned;

  if (company.withdrawnAt || company.moderationStatus === "rejected") {
    return { success: false, error: "not_open" };
  }
  // Only for an application filed before consents were recorded: one that has
  // a payment authority already keeps the terms it was filed on. Re-posting
  // with other choices must not move a paying listing to a second route.
  if (await findPaymentAuthority(db, company.id)) {
    redirect(await listingHoldCheckoutUrl(member, company.id));
  }

  const now = new Date();
  const ticked = tickedConsents(formData);
  const resolved = await resolveApplication(
    db,
    member,
    ticked.has("eu_early_start"),
    now,
  );
  if ((resolved.wording ?? "none") !== formData.get(RENDERED_WORDING_FIELD)) {
    return { success: false, error: "termsChanged" };
  }
  if (!consentsComplete(formData, resolved.wording !== null)) {
    return { success: false, error: "consentsRequired" };
  }

  const already =
    resolved.wording !== null &&
    (await hasPaymentAuthority(db, company.id, member.id, resolved.wording));
  if (!already) {
    await settleFiledApplication(db, {
      memberId: member.id,
      companyId: company.id,
      residenceCountry: member.country,
      locale: member.language ?? "en",
      ticked,
      resolved,
      now,
    });
  }

  redirect(await listingHoldCheckoutUrl(member, company.id));
}
