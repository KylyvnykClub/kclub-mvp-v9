"use server";

import { revalidatePath } from "next/cache";

import { getCurrentMember } from "@/actions/session";
import { appendAuditEntry } from "@/data/audit-log";
import { db } from "@/data/db";
import {
  closePasswordResetRequest,
  listOpenPasswordResetRequests,
} from "@/data/password-reset-requests";
import { buildActor } from "@/domain/actor";
import { assertCan } from "@/domain/authorization";

/**
 * The recovery queue in the staff console (FR-006, ADR 0031).
 *
 * Reading it is a moderation-level action; closing a row is not a reset. The
 * reset itself stays owner-only in `resetMemberPasswordAction`, with its own
 * audit entry — nothing here changes a password, and a staff member who closes
 * a request without performing one has only tidied a screen.
 */
export async function listPasswordResetRequestsAction() {
  const session = await getCurrentMember();

  if (!session?.member) throw new Error("Unauthorized");

  assertCan(buildActor(session.member), "read", "moderation");

  return listOpenPasswordResetRequests(db);
}

export type CloseRequestState = {
  status: "idle" | "closed" | "gone" | "unauthorized" | "failed";
};

/**
 * Take a request off the queue.
 *
 * `handled` says staff acted on it, `dismissed` that they judged it not
 * genuine. Both are audited, because both are a staff decision about a
 * member's account even though neither touches the password.
 */
export async function closePasswordResetRequestAction(
  requestId: string,
  outcome: "handled" | "dismissed",
): Promise<CloseRequestState> {
  try {
    const session = await getCurrentMember();

    if (!session?.member) return { status: "unauthorized" };

    // Same gate as the reset it usually precedes: whoever clears this queue is
    // deciding who gets their account back.
    assertCan(buildActor(session.member), "reset_password", "member");

    const closed = await closePasswordResetRequest(db, {
      requestId,
      staffId: session.member.id,
      outcome,
      now: new Date(),
    });

    if (!closed) {
      // Someone else got there first, or it was never open.
      return { status: "gone" };
    }

    await appendAuditEntry(db, {
      actorType: "staff",
      actorId: session.member.id,
      action: "password_reset_request.closed",
      subjectType: "member",
      subjectId: requestId,
      meta: { outcome },
    });

    revalidatePath("/dashboard/admin/support");
    return { status: "closed" };
  } catch {
    return { status: "failed" };
  }
}
