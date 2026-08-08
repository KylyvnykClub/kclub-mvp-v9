import { eq, ilike, or } from "drizzle-orm";

import type { DbClient } from "./db";
import { cards, companies, members, subscriptions } from "./schema";

export async function findCardByMemberId(db: DbClient, memberId: string) {
  return db.query.cards.findFirst({
    where: eq(cards.memberId, memberId),
  });
}

export async function findCardPublicByToken(db: DbClient, token: string) {
  const rows = await db
    .select({
      serial: cards.serial,
      tier: cards.tier,
      status: cards.status,
      issuedAt: cards.issuedAt,
      memberName: members.displayName,
      memberCountry: members.country,
      memberStatus: members.status,
    })
    .from(cards)
    .innerJoin(members, eq(cards.memberId, members.id))
    .where(eq(cards.token, token))
    .limit(1);

  return rows[0] ?? null;
}

export async function searchMembers(db: DbClient, query?: string) {
  const conditions = query
    ? or(
        ilike(members.displayName, `%${query}%`),
        ilike(members.phone, `%${query}%`),
      )
    : undefined;

  return db.query.members.findMany({
    where: conditions,
    with: {
      cards: true,
      subscriptions: true,
      profile: true,
    },
    limit: 50,
  });
}

export type MemberAdminView = Awaited<ReturnType<typeof searchMembers>>[number];

export async function searchMembersByCardSerial(
  db: DbClient,
  serial: string,
): Promise<MemberAdminView[]> {
  const cardMatches = await db.query.cards.findMany({
    where: ilike(cards.serial, `%${serial}%`),
    with: {
      member: {
        with: {
          cards: true,
          subscriptions: true,
          profile: true,
        },
      },
    },
  });

  return cardMatches
    .map((c) => c.member)
    .filter((m): m is MemberAdminView => m !== null && m !== undefined);
}

export async function setMemberStatus(
  db: DbClient,
  memberId: string,
  status: "active" | "blocked",
): Promise<void> {
  await db.update(members).set({ status }).where(eq(members.id, memberId));
}

export async function revokeCardById(db: DbClient, cardId: string) {
  const [card] = await db
    .update(cards)
    .set({ status: "revoked" })
    .where(eq(cards.id, cardId))
    .returning();

  return card ?? null;
}

export async function insertCard(
  db: DbClient,
  input: {
    memberId: string;
    serial: string;
    token: string;
    tier: "free" | "vip";
  },
) {
  const [card] = await db
    .insert(cards)
    .values({
      memberId: input.memberId,
      serial: input.serial,
      token: input.token,
      tier: input.tier,
      status: "valid",
    })
    .returning();

  return card!;
}

export async function getMemberExportData(db: DbClient, memberId: string) {
  const memberData = await db.query.members.findFirst({
    where: eq(members.id, memberId),
  });

  const memberCards = await db.query.cards.findMany({
    where: eq(cards.memberId, memberId),
  });

  const memberSubscriptions = await db.query.subscriptions.findMany({
    where: eq(subscriptions.memberId, memberId),
  });

  const memberCompanies = await db.query.companies.findMany({
    where: eq(companies.ownerId, memberId),
  });

  return {
    exportDate: new Date().toISOString(),
    member: memberData,
    cards: memberCards,
    subscriptions: memberSubscriptions,
    companies: memberCompanies,
  };
}
