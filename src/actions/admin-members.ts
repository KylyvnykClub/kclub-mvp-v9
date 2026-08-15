"use server";

import { db } from "@/data/db";
import { appendAuditEntry } from "@/data/audit-log";
import {
  findCardById,
  findMemberAdminById,
  insertCard,
  revokeCardById,
  revokeValidCardsByMemberId,
  searchMembers,
  searchMembersByCardSerial,
  setMemberStatus,
  withMemberActivityHistory,
  type MemberAdminView,
} from "@/data/members";
import { getCurrentMember } from "@/actions/session";
import {
  buildActor,
  normalizeRole,
  type CompatiblePersistedRole,
} from "@/domain/actor";
import { can, type Action, type Subject } from "@/domain/authorization";

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

export async function getMembersListAction(query: string = "") {
  const session = await getCurrentMember();
  requireAuthorized(session?.member, "read", "member");

  const textMatches = await searchMembers(db, query || undefined);

  if (!query) {
    return withMemberActivityHistory(db, textMatches);
  }

  const serialMatches = await searchMembersByCardSerial(db, query);
  const merged = new Map<string, MemberAdminView>();
  for (const member of [...textMatches, ...serialMatches]) {
    merged.set(member.id, member);
  }

  return withMemberActivityHistory(db, [...merged.values()]);
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

function generateSerial() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const genGroup = () =>
    Array.from({ length: 4 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length)),
    ).join("");
  return `${genGroup()}-${genGroup()}-${genGroup()}-${genGroup()}`;
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
    serial: generateSerial(),
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
