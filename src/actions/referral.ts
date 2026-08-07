"use server";

import { db } from "@/data/db";
import { appendAuditEntry } from "@/data/audit-log";
import { findActiveSubscriptionByPrice } from "@/data/billing";
import { listApprovedCompaniesWithSubscriptionsByOwner } from "@/data/companies";
import {
  findReferralWithRecipientCompany,
  insertReferral,
  listCompanyIdsByOwner,
  listPendingReviewReferrals,
  listReceivedReferralsForCompanies,
  listReferralsSince,
  listSentReferrals,
  respondToReferral,
  setReferralModeration,
} from "@/data/referrals";
import { getCurrentMember } from "./session";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const referralSchema = z.object({
  recipientCompanyId: z.string(),
  clientName: z.string().min(1, "Client name is required"),
  contactChannel: z.string().min(1, "Contact channel is required"),
  serviceNeeded: z.string().min(1, "Service needed is required"),
  note: z.string().optional(),
  consentAttested: z
    .boolean()
    .refine((v) => v === true, "You must attest to client consent"),
});

export async function createReferralAction(
  data: z.infer<typeof referralSchema>,
) {
  const current = await getCurrentMember();
  const member = current?.member;
  if (!member) throw new Error("Unauthorized");
  if (!member.canSendReferrals)
    throw new Error("You are barred from sending referrals");

  const parsed = referralSchema.parse(data);

  const vipPriceId = process.env.NEXT_PUBLIC_STRIPE_VIP_PRICE_ID;
  if (!vipPriceId) throw new Error("Billing is not configured");

  // FR-070: sender must be VIP and own a published company
  const vipSub = await findActiveSubscriptionByPrice(db, member.id, vipPriceId);

  const memberCompanies = await listApprovedCompaniesWithSubscriptionsByOwner(
    db,
    member.id,
  );

  const hasActiveCompany = memberCompanies.some((c) =>
    c.subscriptions.some((s) => s.status === "active"),
  );

  if (!vipSub || !hasActiveCompany) {
    throw new Error(
      "You must be a VIP member and own at least one published company to send referrals.",
    );
  }

  // FR-073: Rate limiting
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const recentReferrals = await listReferralsSince(db, member.id, oneDayAgo);

  if (recentReferrals.length >= 10) {
    throw new Error(
      "You have reached your limit of 10 referrals per 24 hours.",
    );
  }

  const recentToRecipient = recentReferrals.filter(
    (r) => r.recipientCompanyId === parsed.recipientCompanyId,
  );
  if (recentToRecipient.length >= 3) {
    throw new Error(
      "You have reached your limit of 3 referrals per 24 hours to this company.",
    );
  }

  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const newReferral = await insertReferral(db, {
    senderId: member.id,
    recipientCompanyId: parsed.recipientCompanyId,
    clientName: parsed.clientName,
    contactChannel: parsed.contactChannel,
    serviceNeeded: parsed.serviceNeeded,
    note: parsed.note,
    consentAttested: true,
    consentTimestamp: new Date(),
    expiresAt,
  });

  // FR-087: Audit log
  await appendAuditEntry(db, {
    actorId: member.id,
    actorType: "member",
    action: "create_referral",
    subjectType: "referral",
    subjectId: newReferral.id,
    ip: "unknown",
  });

  revalidatePath("/dashboard/referrals");
  return { success: true };
}

export async function moderateReferralAction(
  referralId: string,
  action: "approve" | "reject",
  reason?: string,
) {
  const current = await getCurrentMember();
  const member = current?.member;
  if (!member || member.role !== "admin") {
    throw new Error("Unauthorized");
  }

  const newStatus = action === "approve" ? "delivered" : "rejected";

  await setReferralModeration(db, referralId, newStatus, member.id, reason);

  await appendAuditEntry(db, {
    actorId: member.id,
    actorType: "member",
    action: `moderate_referral_${action}`,
    subjectType: "referral",
    subjectId: referralId,
    ip: "unknown",
  });

  revalidatePath("/dashboard/admin/referrals");
}

export async function respondToReferralAction(
  referralId: string,
  action: "accept" | "decline",
) {
  const current = await getCurrentMember();
  const member = current?.member;
  if (!member) throw new Error("Unauthorized");

  const referral = await findReferralWithRecipientCompany(db, referralId);

  if (!referral) throw new Error("Not found");
  if (referral.recipientCompany.ownerId !== member.id)
    throw new Error("Unauthorized");
  if (referral.status !== "delivered") throw new Error("Invalid status");

  const newStatus = action === "accept" ? "accepted" : "declined";

  // FR-075: Immediately delete contact details on decline
  await respondToReferral(db, referralId, newStatus, action === "decline");

  revalidatePath("/dashboard/referrals");
}

export async function getSentReferralsAction() {
  const current = await getCurrentMember();
  const member = current?.member;
  if (!member) return [];

  return listSentReferrals(db, member.id);
}

export async function getReceivedReferralsAction() {
  const current = await getCurrentMember();
  const member = current?.member;
  if (!member) return [];

  const companyIds = await listCompanyIdsByOwner(db, member.id);

  if (companyIds.length === 0) return [];

  return listReceivedReferralsForCompanies(db, companyIds);
}

export async function getPendingReferralsAction() {
  const current = await getCurrentMember();
  const member = current?.member;
  if (!member || member.role !== "admin") return [];

  return listPendingReviewReferrals(db);
}
