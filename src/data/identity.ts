import { randomUUID } from "node:crypto";
import { and, desc, eq, ne, or } from "drizzle-orm";

import { appendAuditEntry } from "./audit-log";
import type { DbClient } from "./db";
import { cards, legalAcceptances, members, sessions } from "./schema";
import { createCardPublicTokenWithEnv, hashCardToken } from "@/lib/card-token";
import { hashSessionToken } from "@/lib/session-token";

function sessionTokenLookup(token: string) {
  const tokenHash = hashSessionToken(token);

  return or(eq(sessions.tokenHash, tokenHash), eq(sessions.token, token));
}

export async function findMemberByPhone(db: DbClient, phone: string) {
  return db.query.members.findFirst({
    where: eq(members.phone, phone),
  });
}

export interface RegisterMemberInput {
  phone: string;
  passwordHash: string;
  displayName: string;
  country: string;
  language: string;
  userAgent: string;
  ipAddress: string;
  consents: Array<{ documentId: string; version: string }>;
  cardSerial: string;
  sessionToken: string;
}

export async function registerMemberTx(
  db: DbClient,
  input: RegisterMemberInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [member] = await tx
      .insert(members)
      .values({
        phone: input.phone,
        passwordHash: input.passwordHash,
        displayName: input.displayName,
        country: input.country,
        language: input.language,
      })
      .returning();

    if (input.consents.length > 0) {
      await tx.insert(legalAcceptances).values(
        input.consents.map((c) => ({
          memberId: member!.id,
          documentId: c.documentId,
          version: c.version,
        })),
      );
    }

    const cardId = randomUUID();
    const cardTokenHash = hashCardToken(createCardPublicTokenWithEnv(cardId));

    await tx.insert(cards).values({
      id: cardId,
      memberId: member!.id,
      serial: input.cardSerial,
      token: cardTokenHash,
      tokenHash: cardTokenHash,
      tier: "free",
    });

    const sessionTokenHash = hashSessionToken(input.sessionToken);

    await tx.insert(sessions).values({
      memberId: member!.id,
      token: sessionTokenHash,
      tokenHash: sessionTokenHash,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    });

    await appendAuditEntry(tx, {
      actorType: "member",
      actorId: member!.id,
      action: "member.registered",
      subjectType: "member",
      subjectId: member!.id,
      ip: input.ipAddress,
      userAgent: input.userAgent,
    });
  });
}

export async function createSessionTx(
  db: DbClient,
  input: {
    memberId: string;
    sessionToken: string;
    userAgent: string;
    ipAddress: string;
    isPartialSession?: boolean;
    /** Encrypted seed for a staff member mid-enrolment. Never plaintext. */
    pendingTotpSecret?: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const sessionTokenHash = hashSessionToken(input.sessionToken);

    await tx.insert(sessions).values({
      memberId: input.memberId,
      token: sessionTokenHash,
      tokenHash: sessionTokenHash,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      isPartialSession: input.isPartialSession ?? false,
      pendingTotpSecret: input.pendingTotpSecret ?? null,
    });

    await appendAuditEntry(tx, {
      actorType: "member",
      actorId: input.memberId,
      action: "member.logged_in",
      subjectType: "member",
      subjectId: input.memberId,
      ip: input.ipAddress,
      userAgent: input.userAgent,
    });
  });
}

export async function findActiveSessionByToken(db: DbClient, token: string) {
  const session = await db.query.sessions.findFirst({
    where: sessionTokenLookup(token),
    with: {
      member: true,
    },
  });

  if (!session || !session.member) {
    return null;
  }

  if (session.member.status !== "active") {
    return null;
  }

  return session;
}

export async function deleteSessionByToken(
  db: DbClient,
  token: string,
): Promise<void> {
  await db.delete(sessions).where(sessionTokenLookup(token));
}

export async function deleteSessionsByMemberId(
  db: DbClient,
  memberId: string,
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.memberId, memberId));
}

/**
 * Replace a member's password hash (FR-006, ADR 0018).
 *
 * Takes an already-hashed value: a plaintext password has no business reaching
 * the data layer, where it would end up in a query the driver can echo back in
 * an error message.
 *
 * Returns whether a row was actually updated, so the caller can tell a real
 * reset from a reset of a member that does not exist.
 */
export async function setMemberPasswordHash(
  db: DbClient,
  memberId: string,
  passwordHash: string,
): Promise<boolean> {
  const updated = await db
    .update(members)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(members.id, memberId))
    .returning({ id: members.id });

  return updated.length > 0;
}

/**
 * The member's own sessions, for the screen that lets them end one (FR-007).
 *
 * The token is deliberately not selected. This list exists to be rendered, and
 * a session token that reaches a template is a session token that can leak;
 * a session is ended by its id, which is not a credential.
 */
export async function listSessionsByMemberId(db: DbClient, memberId: string) {
  return db
    .select({
      id: sessions.id,
      userAgent: sessions.userAgent,
      ipAddress: sessions.ipAddress,
      lastSeenAt: sessions.lastSeenAt,
      createdAt: sessions.createdAt,
      isPartialSession: sessions.isPartialSession,
    })
    .from(sessions)
    .where(eq(sessions.memberId, memberId))
    .orderBy(desc(sessions.lastSeenAt));
}

export type MemberSessionView = Awaited<
  ReturnType<typeof listSessionsByMemberId>
>[number];

/**
 * End one session, but only if it belongs to this member.
 *
 * The member id is part of the WHERE clause rather than checked beforehand:
 * a guessed session id from another account then deletes nothing instead of
 * relying on a check somebody could later move or forget.
 */
export async function deleteSessionByIdForMember(
  db: DbClient,
  memberId: string,
  sessionId: string,
): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.memberId, memberId)))
    .returning({ id: sessions.id });

  return deleted.length;
}

/** End every session except the one making the request ("sign out everywhere else"). */
export async function deleteOtherSessionsForMember(
  db: DbClient,
  memberId: string,
  keepSessionId: string,
): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(and(eq(sessions.memberId, memberId), ne(sessions.id, keepSessionId)))
    .returning({ id: sessions.id });

  return deleted.length;
}

export async function upgradeSessionTx(
  db: DbClient,
  token: string,
  memberId: string,
  ipAddress: string,
  userAgent: string,
  /**
   * The already-encrypted seed to enrol, when this sign-in was an enrolment.
   * It comes from the session's own pending column, never from the request -
   * the caller must not be able to choose which secret a member ends up with.
   */
  encryptedSecretToEnrol?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    // The pending seed is cleared whether or not it was enrolled, so an
    // abandoned enrolment does not leave a seed sitting on a live session.
    await tx
      .update(sessions)
      .set({ isPartialSession: false, pendingTotpSecret: null })
      .where(sessionTokenLookup(token));

    if (encryptedSecretToEnrol) {
      await tx
        .update(members)
        .set({ totpEnabled: true, totpSecret: encryptedSecretToEnrol })
        .where(eq(members.id, memberId));
    }

    await appendAuditEntry(tx, {
      actorType: "member",
      actorId: memberId,
      action: "member.totp_verified",
      subjectType: "member",
      subjectId: memberId,
      ip: ipAddress,
      userAgent,
    });
  });
}
