"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/data/db";
import {
  deleteOtherSessionsForMember,
  deleteSessionByIdForMember,
  listSessionsByMemberId,
  type MemberSessionView,
} from "@/data/identity";
import { getCurrentMember } from "./session";
import { buildActor } from "@/domain/actor";
import { assertCan } from "@/domain/authorization";

/**
 * Session management for the member who owns them (FR-007).
 *
 * This is the control someone reaches for when they suspect their account is
 * being used from a device they do not have, so the read never exposes a token
 * and every write is scoped to the acting member in the query itself.
 */

export type SessionListItem = Omit<MemberSessionView, "isPartialSession"> & {
  /** True for the session making this request; it cannot be ended from here. */
  current: boolean;
};

export type SessionActionState = {
  success: boolean;
  error?: string;
  endedCount?: number;
};

export async function listOwnSessionsAction(): Promise<SessionListItem[]> {
  const auth = await getCurrentMember();
  if (!auth?.member) return [];

  const actor = buildActor(auth.member);
  assertCan(actor, "read", "own_session");

  const rows = await listSessionsByMemberId(db, auth.member.id);

  return (
    rows
      // A half-finished sign-in is not a device the member is signed in on.
      .filter((row) => !row.isPartialSession)
      .map(({ isPartialSession: _isPartialSession, ...row }) => ({
        ...row,
        current: row.id === auth.session.id,
      }))
  );
}

export async function revokeOwnSessionAction(
  sessionId: string,
): Promise<SessionActionState> {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    return { success: false, error: "Unauthorized" };
  }

  const actor = buildActor(auth.member);
  assertCan(actor, "delete", "own_session");

  // Ending the current session from this screen would look like a bug rather
  // than a sign-out; that is what the sign-out button is for.
  if (sessionId === auth.session.id) {
    return { success: false, error: "Use sign out to end the current session" };
  }

  const ended = await deleteSessionByIdForMember(db, auth.member.id, sessionId);

  if (ended === 0) {
    // Either it was already gone or it belongs to somebody else. The member
    // is told the same thing in both cases.
    return { success: false, error: "Session not found" };
  }

  revalidatePath("/dashboard/profile");
  return { success: true, endedCount: ended };
}

export async function revokeOtherSessionsAction(): Promise<SessionActionState> {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    return { success: false, error: "Unauthorized" };
  }

  const actor = buildActor(auth.member);
  assertCan(actor, "delete", "own_session");

  const ended = await deleteOtherSessionsForMember(
    db,
    auth.member.id,
    auth.session.id,
  );

  revalidatePath("/dashboard/profile");
  return { success: true, endedCount: ended };
}
