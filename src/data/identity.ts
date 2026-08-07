import { eq } from "drizzle-orm";

import { appendAuditEntry } from "./audit-log";
import type { DbClient } from "./db";
import { cards, legalAcceptances, members, sessions } from "./schema";

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
  cardToken: string;
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

    await tx.insert(cards).values({
      memberId: member!.id,
      serial: input.cardSerial,
      token: input.cardToken,
      tier: "free",
    });

    await tx.insert(sessions).values({
      memberId: member!.id,
      token: input.sessionToken,
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
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(sessions).values({
      memberId: input.memberId,
      token: input.sessionToken,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
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
    where: eq(sessions.token, token),
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
  await db.delete(sessions).where(eq(sessions.token, token));
}
