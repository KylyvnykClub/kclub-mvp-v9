"use server";

import { db } from "@/data/db";
import { appendAuditEntry } from "@/data/audit-log";
import {
  insertCard,
  revokeCardById,
  searchMembers,
  searchMembersByCardSerial,
  setMemberStatus,
} from "@/data/members";
import { getCurrentMember } from "@/actions/session";
import { buildActor, type PersistedRole } from "@/domain/actor";
import { can, type Action, type Subject } from "@/domain/authorization";

function requireAuthorized(
  member: { id: string; role: PersistedRole } | undefined,
  action: Action,
  subject: Subject,
) {
  if (!member) throw new Error("Unauthorized");

  const actor = buildActor(member);
  if (!can(actor, action, subject)) throw new Error("Unauthorized");
  return member;
}

export async function getMembersListAction(query: string = "") {
  const session = await getCurrentMember();
  requireAuthorized(session?.member, "read", "member");

  const result = await searchMembers(db, query || undefined);

  // Card serial lives in a relation, so fall back to a serial search when
  // the member search found nothing.
  if (query && result.length === 0) {
    return searchMembersByCardSerial(db, query);
  }

  return result;
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

  if (blocked && !reason) {
    throw new Error("Reason is required when blocking a member");
  }

  await setMemberStatus(db, memberId, blocked ? "blocked" : "active");

  // FR-087: Audit log
  await appendAuditEntry(db, {
    actorType: member.role,
    actorId: member.id,
    action: blocked ? "block_member" : "unblock_member",
    subjectType: "member",
    subjectId: memberId,
    meta: { reason, blocked },
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

  const existingCard = await revokeCardById(db, cardId);

  if (!existingCard) throw new Error("Card not found");

  // FR-087: Audit log
  await appendAuditEntry(db, {
    actorType: member.role,
    actorId: member.id,
    action: "revoke_card",
    subjectType: "card",
    subjectId: cardId,
    meta: { reason },
  });

  return existingCard;
}

export async function reissueCardAction(
  memberId: string,
  tier: "free" | "vip",
) {
  const session = await getCurrentMember();
  const member = requireAuthorized(session?.member, "reissue", "card");

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
  });

  return newCard;
}
