"use server";

import { db } from "@/data/db";
import { appendAuditEntry } from "@/data/audit-log";
import {
  deleteSessionsByMemberId,
  setMemberPasswordHash,
} from "@/data/identity";
import {
  countMembers,
  countMembersByPlan,
  countMembersByStatus,
  findCardById,
  findMemberAdminById,
  insertCard,
  MEMBER_ADMIN_PLANS,
  MEMBER_ADMIN_STATUSES,
  revokeCardById,
  revokeValidCardsByMemberId,
  searchMembers,
  setMemberStatus,
  withMemberActivityHistory,
} from "@/data/members";
import {
  DEFAULT_PAGE_SIZE,
  pageParamsFromSearchParam,
} from "@/data/pagination";
import { getCurrentMember } from "@/actions/session";
import { hashPassword } from "@/modules/identity";
import {
  buildActor,
  normalizeRole,
  type CompatiblePersistedRole,
} from "@/domain/actor";
import { can, type Action, type Subject } from "@/domain/authorization";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requestAccountDeletionTx } from "@/data/account-deletion";
import { listActiveSubscriptionsForDeletion } from "@/data/billing";
import { listUndeletedCompanyIdsByOwner } from "@/data/companies";
import {
  productionListingCancellationDeps,
  stopMemberRenewals,
} from "@/modules/billing/listing-cancellation";
import { deleteCompanyForStaff } from "@/modules/catalogue/delete-company";

function requireAuthorized(
  member: { id: string; role: CompatiblePersistedRole } | undefined,
  action: Action,
  subject: Subject,
) {
  if (!member) throw new Error("Unauthorized");

  const actor = buildActor(member);
  if (!can(actor, action, subject)) throw new Error("Unauthorized");
  return {
    id: member.id,
    role: normalizeRole(member.role),
  };
}

/**
 * The values arrive straight from the query string, so an unknown status or a
 * nonsense page falls back to the unfiltered first page rather than throwing -
 * a hand-edited URL is a bad filter, not an error worth a 500.
 */
const resetPasswordSchema = z.object({
  memberId: z.uuid(),
  // Same floor the member's own registration enforces, so a reset cannot be
  // used to sneak a weaker password past the rule.
  newPassword: z.string().min(8).max(100),
  // Free text on purpose: it is the staff member's account of what identity
  // proof they accepted, and no enum can enumerate that yet (ADR 0018).
  reason: z.string().min(1).max(500),
});

const membersListParamsSchema = z.object({
  query: z.string().trim().max(120).optional().catch(undefined),
  status: z.enum(MEMBER_ADMIN_STATUSES).optional().catch(undefined),
  plan: z.enum(MEMBER_ADMIN_PLANS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

export async function getMembersListAction(
  params: {
    query?: string;
    status?: string;
    plan?: string;
    page?: string | number;
  } = {},
) {
  const session = await getCurrentMember();
  requireAuthorized(session?.member, "read", "member");

  const { query, status, plan, page } = membersListParamsSchema.parse(params);
  const filters = { query: query || undefined, status, plan };

  // Each chip set ignores its own filter and honours the other, so the numbers
  // describe what selecting that chip would find from here.
  const [total, statusCounts, planCounts] = await Promise.all([
    countMembers(db, filters),
    countMembersByStatus(db, { query: filters.query, plan: filters.plan }),
    countMembersByPlan(db, { query: filters.query, status: filters.status }),
  ]);

  // The count comes first so a page past the end lands on the last real page
  // instead of rendering an empty table under a "page 999 of 3" heading.
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const rows = await searchMembers(
    db,
    filters,
    pageParamsFromSearchParam(currentPage, DEFAULT_PAGE_SIZE),
  );

  return {
    rows: await withMemberActivityHistory(db, rows),
    total,
    page: currentPage,
    pageSize: DEFAULT_PAGE_SIZE,
    statusCounts,
    planCounts,
  };
}

export async function blockMemberAction(
  memberId: string,
  blocked: boolean,
  reason: string,
) {
  const session = await getCurrentMember();
  const member = requireAuthorized(
    session?.member,
    blocked ? "block" : "unblock",
    "member",
  );

  if (!reason) {
    throw new Error("Reason is required when changing member status");
  }

  const before = await findMemberAdminById(db, memberId);
  const updated = await setMemberStatus(
    db,
    memberId,
    blocked ? "blocked" : "active",
  );

  if (!updated) throw new Error("Member not found");

  // FR-010: every session of a blocked member must be terminated. A blocked
  // member already fails findActiveSessionByToken, so this is the second half
  // of the guarantee - without it the rows outlive the block and start working
  // again the moment the member is unblocked. Staff blocking already does this
  // (actions/staff.ts); members were the gap.
  if (blocked) {
    await deleteSessionsByMemberId(db, memberId);
  }

  // FR-087: Audit log
  await appendAuditEntry(db, {
    actorType: member.role,
    actorId: member.id,
    action: blocked ? "block_member" : "unblock_member",
    subjectType: "member",
    subjectId: memberId,
    meta: {
      reason,
      before: { status: before?.status ?? null },
      after: { status: updated.status },
    },
  });
}

/**
 * FR-006, ADR 0018: a staff owner resets a member's password after verifying
 * who they are by some means outside this system.
 *
 * This is the whole of account recovery for now, and it is a stopgap. There is
 * no member-facing self-service path: SMS is postponed (ADR 0012) and members
 * have no email on file, so nothing can be sent to them to prove they are them.
 * The reason field is where the staff member records what identity proof they
 * accepted, because the system cannot check any.
 *
 * Every other session dies with the old password, which is the half of FR-006
 * that stops a reset from leaving a thief signed in.
 */
export async function resetMemberPasswordAction(
  memberId: string,
  newPassword: string,
  reason: string,
) {
  const session = await getCurrentMember();
  const actor = requireAuthorized(session?.member, "reset_password", "member");

  const input = resetPasswordSchema.parse({ memberId, newPassword, reason });

  const updated = await setMemberPasswordHash(
    db,
    input.memberId,
    await hashPassword(input.newPassword),
  );

  if (!updated) throw new Error("Member not found");

  await deleteSessionsByMemberId(db, input.memberId);

  // FR-087. The password is not in here, in any form: neither the plaintext nor
  // the hash, both of which security.md names as never logged.
  await appendAuditEntry(db, {
    actorType: actor.role,
    actorId: actor.id,
    action: "reset_member_password",
    subjectType: "member",
    subjectId: input.memberId,
    meta: { reason: input.reason, sessionsRevoked: true },
  });
}

export async function revokeCardAction(cardId: string, reason: string) {
  const session = await getCurrentMember();
  const member = requireAuthorized(session?.member, "revoke", "card");

  if (!reason) {
    throw new Error("Reason is required to revoke a card");
  }

  const before = await findCardById(db, cardId);
  if (!before) throw new Error("Card not found");

  const existingCard = await revokeCardById(db, cardId);

  if (!existingCard) throw new Error("Card not found");

  // FR-087: Audit log
  await appendAuditEntry(db, {
    actorType: member.role,
    actorId: member.id,
    action: "revoke_card",
    subjectType: "card",
    subjectId: cardId,
    meta: {
      reason,
      before: { status: before.status },
      after: { status: existingCard.status },
    },
  });

  return existingCard;
}

export async function reissueCardAction(
  memberId: string,
  tier: "free" | "vip",
) {
  const session = await getCurrentMember();
  const member = requireAuthorized(session?.member, "reissue", "card");
  const targetMember = await findMemberAdminById(db, memberId);
  if (!targetMember) throw new Error("Member not found");

  // FR-025: the previous QR token must stop working the moment a new card is
  // issued. The token is derived from the card id and cannot be withdrawn, so
  // the old rows are revoked - a stale QR then verifies as revoked rather than
  // as a second live card.
  const revoked = await revokeValidCardsByMemberId(db, memberId);

  const newCard = await insertCard(db, {
    memberId,
    tier,
  });

  await appendAuditEntry(db, {
    actorType: member.role,
    actorId: member.id,
    action: "issue_card",
    subjectType: "card",
    subjectId: newCard.id,
    meta: {
      before: {
        revokedCardIds: revoked.map((card) => card.id),
      },
      after: {
        memberId,
        tier: newCard.tier,
        status: newCard.status,
      },
    },
  });

  return newCard;
}

const deleteMemberSchema = z.object({
  memberId: z.uuid(),
  reason: z.string().trim().min(3).max(500),
});

/**
 * FR-046 / data-storage.md §4: staff record a member's deletion. The member is
 * treated exactly as one who asked for it - `pending_deletion`, signed out,
 * erased by the retention job on day 30 - with every subscription marked for
 * cancellation. Two things happen at once rather than on day 30: renewals
 * stop in Stripe, so nobody is billed after being deleted, and the member's
 * companies are deleted, so they leave the catalogue now.
 */
export async function staffDeleteMemberAction(input: {
  memberId: string;
  reason: string;
}) {
  const session = await getCurrentMember();
  const staff = requireAuthorized(session?.member, "delete", "member");

  const parsed = deleteMemberSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "invalid_input" };
  const { memberId, reason } = parsed.data;

  if (memberId === staff.id) return { success: false, error: "not_self" };

  const target = await findMemberAdminById(db, memberId);
  if (!target) return { success: false, error: "not_found" };
  if (target.deletedAt) return { success: true, alreadyApplied: true };

  // Already pending - asked for by the member, or a staff deletion that did
  // not finish: the request stands and only the rest is carried out, so
  // pressing again completes it.
  if (target.status !== "pending_deletion") {
    const active = await listActiveSubscriptionsForDeletion(db, memberId);
    await requestAccountDeletionTx(
      db,
      memberId,
      active.map((subscription) => ({
        subscriptionId: subscription.id,
        decision: "cancel" as const,
      })),
      { staffId: staff.id, staffRole: staff.role, reason },
    );
  }

  const now = new Date();
  for (const companyId of await listUndeletedCompanyIdsByOwner(db, memberId)) {
    await deleteCompanyForStaff(
      db,
      companyId,
      staff,
      `Owner deleted: ${reason}`,
      now,
    );
  }

  try {
    const stopped = await stopMemberRenewals(
      db,
      await productionListingCancellationDeps(),
      memberId,
    );
    if (stopped.length > 0) {
      await appendAuditEntry(db, {
        actorType: staff.role,
        actorId: staff.id,
        action: "member.renewals_stopped",
        subjectType: "member",
        subjectId: memberId,
        meta: { subscriptions: stopped },
      });
    }
  } catch (error) {
    // The deletion stands; pressing again retries this step.
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[member-deletion] renewal stop failed for ${memberId}: ${message}`,
    );
    await appendAuditEntry(db, {
      actorType: staff.role,
      actorId: staff.id,
      action: "member.renewals_stop_failed",
      subjectType: "member",
      subjectId: memberId,
      meta: { error: message },
    });
    revalidateAfterDeletion();
    // Told plainly, so staff press again: a renewal inside the 30 days would
    // otherwise bill a member they deleted.
    return { success: false, error: "renewals_not_stopped" };
  }

  revalidateAfterDeletion();
  return { success: true };
}

function revalidateAfterDeletion() {
  revalidatePath("/");
  revalidatePath("/dashboard/admin/members");
  revalidatePath("/dashboard/admin/companies");
  revalidatePath("/directory");
}
