"use server";

import { db } from "@/data/db";
import { appendAuditEntry } from "@/data/audit-log";
import { findActiveVipSubscription } from "@/data/billing";
import { listApprovedCompaniesWithSubscriptionsByOwner } from "@/data/companies";
import { createNotification } from "@/data/notifications";
import {
  countReferralsByStatus,
  countReferralsForAdmin,
  findReferralForAdmin,
  findReferralWithRecipientCompany,
  insertReferral,
  listCompanyIdsByOwner,
  listPendingReviewReferrals,
  listReferralsForAdmin,
  REFERRAL_ADMIN_STATUSES,
  listReceivedReferralsForCompanies,
  listReferralsSince,
  listSentReferrals,
  respondToReferral,
  setMemberReferralPermission,
  setReferralModeration,
} from "@/data/referrals";
import {
  REFERRAL_DAILY_LIMIT,
  REFERRAL_PER_RECIPIENT_DAILY_LIMIT,
  checkReferralLimits,
  referralWindowStart,
} from "@/lib/referral-limits";
import {
  DEFAULT_PAGE_SIZE,
  pageParamsFromSearchParam,
} from "@/data/pagination";
import { getCurrentMember } from "./session";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
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

  const vipSub = await findActiveVipSubscription(db, member.id);
  const actor = buildActor({
    id: member.id,
    role: vipSub ? "member_vip" : "member",
  });
  if (!can(actor, "send_referral", "referral")) {
    throw new Error(
      "Unauthorized to send referrals. VIP subscription required, and you must not be barred.",
    );
  }

  // A member must own at least one published company to send a referral.
  const memberCompanies = await listApprovedCompaniesWithSubscriptionsByOwner(
    db,
    member.id,
  );

  const hasActiveCompany = memberCompanies.some((c) =>
    c.subscriptions.some((s) => s.status === "active"),
  );

  if (!hasActiveCompany) {
    throw new Error(
      "You must own at least one published company to send referrals.",
    );
  }

  // FR-073: rolling-window limits, 10 a day and 3 to any one company.
  const recentReferrals = await listReferralsSince(
    db,
    member.id,
    referralWindowStart(new Date()),
  );

  const breach = checkReferralLimits(
    recentReferrals,
    parsed.recipientCompanyId,
  );

  if (breach.exceeded) {
    throw new Error(
      breach.limit === "daily"
        ? `You have reached your limit of ${REFERRAL_DAILY_LIMIT} referrals per 24 hours.`
        : `You have reached your limit of ${REFERRAL_PER_RECIPIENT_DAILY_LIMIT} referrals per 24 hours to this company.`,
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
  if (!member) {
    throw new Error("Unauthorized");
  }

  const actor = buildActor(member);
  if (!can(actor, action, "referral")) {
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

  // FR-074: approval is the point at which the recipient is notified. Until
  // ADR 0020 nothing happened here at all - a partner was introduced a client
  // and was told by no channel whatsoever.
  //
  // The notification names the recipient's OWN company and carries no word
  // about who sent it. Who introduced whom is between the two businesses on
  // the referrals screen; an inbox row is not the place to widen what one
  // member learns about another (ADR 0005).
  if (newStatus === "delivered") {
    const referral = await findReferralWithRecipientCompany(db, referralId);
    if (referral?.recipientCompany) {
      await createNotification(db, {
        memberId: referral.recipientCompany.ownerId,
        kind: "referral_received",
        params: {
          referralId,
          companyId: referral.recipientCompany.id,
          companyName: referral.recipientCompany.name,
        },
        // Moderation is once-per-referral, but a re-run of a stuck queue must
        // not deliver a second copy of the same introduction.
        dedupeKey: `referral_received:${referralId}`,
      });
    }
  }

  revalidatePath("/dashboard/admin/referrals");
}

export async function barReferralSenderAction(
  senderId: string,
  barred: boolean,
  reason: string,
) {
  const current = await getCurrentMember();
  const member = current?.member;
  if (!member) {
    throw new Error("Unauthorized");
  }

  const actor = buildActor(member);
  if (!can(actor, "block", "referral")) {
    throw new Error("Unauthorized");
  }

  if (!reason) {
    throw new Error("Reason is required to change referral sending access");
  }

  const updated = await setMemberReferralPermission(db, senderId, !barred);
  if (!updated) {
    throw new Error("Member not found");
  }

  await appendAuditEntry(db, {
    actorId: member.id,
    actorType: member.role,
    action: barred ? "bar_referral_sender" : "unbar_referral_sender",
    subjectType: "member",
    subjectId: senderId,
    meta: {
      reason,
      before: { canSendReferrals: barred },
      after: { canSendReferrals: updated.canSendReferrals },
    },
    ip: "unknown",
  });

  revalidatePath("/dashboard/admin/referrals");
  revalidatePath("/dashboard/admin/members");
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

  await appendAuditEntry(db, {
    actorId: member.id,
    actorType: member.role,
    action: `respond_referral_${action}`,
    subjectType: "referral",
    subjectId: referralId,
    meta: {
      before: { status: referral.status },
      after: { status: newStatus },
      redactedContactDetails: action === "decline",
    },
    ip: "unknown",
  });

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

const referralsListParamsSchema = z.object({
  query: z.string().trim().max(120).optional().catch(undefined),
  status: z.enum(REFERRAL_ADMIN_STATUSES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

const EMPTY_REFERRAL_PAGE = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  statusCounts: Object.fromEntries(
    REFERRAL_ADMIN_STATUSES.map((status) => [status, 0]),
  ) as Record<(typeof REFERRAL_ADMIN_STATUSES)[number], number>,
};

export async function getReferralsForAdminAction(
  params: { query?: string; status?: string; page?: string | number } = {},
) {
  const current = await getCurrentMember();
  const member = current?.member;
  if (!member) return EMPTY_REFERRAL_PAGE;

  const actor = buildActor(member);
  if (!can(actor, "approve", "referral") && !can(actor, "reject", "referral")) {
    return EMPTY_REFERRAL_PAGE;
  }

  const { query, status, page } = referralsListParamsSchema.parse(params);
  const filters = { query: query || undefined, status };

  const [total, statusCounts] = await Promise.all([
    countReferralsForAdmin(db, filters),
    countReferralsByStatus(db, { query: filters.query }),
  ]);

  // Count first, then clamp, so a page past the end shows the last real page
  // rather than an empty table under a heading that says otherwise.
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const rows = await listReferralsForAdmin(
    db,
    filters,
    pageParamsFromSearchParam(currentPage, DEFAULT_PAGE_SIZE),
  );

  return {
    rows,
    total,
    page: currentPage,
    pageSize: DEFAULT_PAGE_SIZE,
    statusCounts,
  };
}

/**
 * The full introduction behind one drawer, client details included. Separate
 * from the list action so those details are read for the row a moderator
 * opened rather than shipped with every row of the page.
 */
export async function getReferralDetailAction(referralId: string) {
  const current = await getCurrentMember();
  const member = current?.member;
  if (!member) return null;

  const actor = buildActor(member);
  if (!can(actor, "approve", "referral") && !can(actor, "reject", "referral")) {
    return null;
  }

  const parsed = z.string().uuid().safeParse(referralId);
  if (!parsed.success) return null;

  return (await findReferralForAdmin(db, parsed.data)) ?? null;
}

export async function getPendingReferralsAction() {
  const current = await getCurrentMember();
  const member = current?.member;
  if (!member) return [];

  const actor = buildActor(member);
  if (!can(actor, "approve", "referral") && !can(actor, "reject", "referral")) {
    return [];
  }

  return listPendingReviewReferrals(db);
}
