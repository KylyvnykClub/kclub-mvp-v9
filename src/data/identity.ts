import { randomUUID } from "node:crypto";
import { eq, or } from "drizzle-orm";

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

export async function upgradeSessionTx(
  db: DbClient,
  token: string,
  memberId: string,
  ipAddress: string,
  userAgent: string,
  newSecret?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(sessions)
      .set({ isPartialSession: false })
      .where(sessionTokenLookup(token));

    if (newSecret) {
      await tx
        .update(members)
        .set({ totpEnabled: true, totpSecret: newSecret })
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
