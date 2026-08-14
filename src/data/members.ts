import { randomUUID } from "node:crypto";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";

import type { DbClient } from "./db";
import {
  accountDeletionRequests,
  auditLog,
  cards,
  companies,
  legalAcceptances,
  members,
  profiles,
  referrals,
  sessions,
  subscriptions,
} from "./schema";
import { createCardPublicTokenWithEnv, hashCardToken } from "@/lib/card-token";

const CLUB_MEMBER_ROLES = [
  "member",
  "member_vip",
  "partner_owner",
  "user",
] as const;

function cardTokenLookup(token: string) {
  const tokenHash = hashCardToken(token);

  return or(eq(cards.tokenHash, tokenHash), eq(cards.token, token));
}

export async function findCardByMemberId(db: DbClient, memberId: string) {
  const card = await db.query.cards.findFirst({
    where: eq(cards.memberId, memberId),
  });

  if (!card) return null;

  return {
    ...card,
    token: createCardPublicTokenWithEnv(card.id),
  };
}

export async function findCardById(db: DbClient, cardId: string) {
  return db.query.cards.findFirst({
    where: eq(cards.id, cardId),
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
    })
    .from(cards)
    .innerJoin(members, eq(cards.memberId, members.id))
    .where(cardTokenLookup(token))
    .limit(1);

  return rows[0] ?? null;
}

export async function searchMembers(db: DbClient, query?: string) {
  const textConditions = query
    ? or(
        ilike(members.displayName, `%${query}%`),
        ilike(members.phone, `%${query}%`),
      )
    : undefined;

  return db.query.members.findMany({
    where: textConditions
      ? and(inArray(members.role, CLUB_MEMBER_ROLES), textConditions)
      : inArray(members.role, CLUB_MEMBER_ROLES),
    with: {
      cards: true,
      subscriptions: {
        with: {
          company: true,
        },
      },
      profile: true,
    },
    limit: 50,
  });
}

export type MemberAdminView = Awaited<ReturnType<typeof searchMembers>>[number];

export async function findMemberAdminById(db: DbClient, memberId: string) {
  return db.query.members.findFirst({
    where: and(
      eq(members.id, memberId),
      inArray(members.role, CLUB_MEMBER_ROLES),
    ),
    with: {
      cards: true,
      subscriptions: {
        with: {
          company: true,
        },
      },
      profile: true,
    },
  });
}

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
          subscriptions: {
            with: {
              company: true,
            },
          },
          profile: true,
        },
      },
    },
  });

  return cardMatches
    .map((c) => c.member)
    .filter(
      (m): m is MemberAdminView =>
        m !== null &&
        m !== undefined &&
        CLUB_MEMBER_ROLES.includes(
          m.role as (typeof CLUB_MEMBER_ROLES)[number],
        ),
    );
}

export type MemberAuditHistoryEntry = typeof auditLog.$inferSelect;

export type MemberAdminDirectoryView = MemberAdminView & {
  activityHistory: MemberAuditHistoryEntry[];
};

export async function listMemberActivityHistory(
  db: DbClient,
  member: MemberAdminView,
) {
  const subjectIds = [
    member.id,
    ...member.cards.map((card) => card.id),
    ...member.subscriptions.map((subscription) => subscription.id),
  ];

  return db.query.auditLog.findMany({
    where: inArray(auditLog.subjectId, subjectIds),
    orderBy: [desc(auditLog.createdAt)],
    limit: 20,
  });
}

export async function withMemberActivityHistory(
  db: DbClient,
  rows: MemberAdminView[],
): Promise<MemberAdminDirectoryView[]> {
  return Promise.all(
    rows.map(async (member) => ({
      ...member,
      activityHistory: await listMemberActivityHistory(db, member),
    })),
  );
}

export async function setMemberStatus(
  db: DbClient,
  memberId: string,
  status: "active" | "blocked",
): Promise<MemberAdminView | null> {
  const [member] = await db
    .update(members)
    .set({ status })
    .where(
      and(eq(members.id, memberId), inArray(members.role, CLUB_MEMBER_ROLES)),
    )
    .returning();

  if (!member) return null;

  return (await findMemberAdminById(db, member.id)) ?? null;
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
    tier: "free" | "vip";
  },
) {
  const cardId = randomUUID();
  const cardTokenHash = hashCardToken(createCardPublicTokenWithEnv(cardId));

  const [card] = await db
    .insert(cards)
    .values({
      id: cardId,
      memberId: input.memberId,
      serial: input.serial,
      token: cardTokenHash,
      tokenHash: cardTokenHash,
      tier: input.tier,
      status: "valid",
    })
    .returning();

  return card!;
}

export async function updateMemberPersonalInfo(
  db: DbClient,
  memberId: string,
  data: {
    displayName: string;
    language: string;
    country: string;
  },
) {
  const [updated] = await db
    .update(members)
    .set({
      displayName: data.displayName,
      language: data.language,
      country: data.country,
    })
    .where(eq(members.id, memberId))
    .returning();

  return updated ?? null;
}

export async function updateMemberPhone(
  db: DbClient,
  memberId: string,
  newPhone: string,
) {
  const [updated] = await db
    .update(members)
    .set({ phone: newPhone })
    .where(eq(members.id, memberId))
    .returning();

  return updated ?? null;
}

export async function findMemberLanguage(
  db: DbClient,
  memberId: string,
): Promise<string | null> {
  const row = await db.query.members.findFirst({
    where: eq(members.id, memberId),
    columns: { language: true },
  });
  return row?.language ?? null;
}

export async function getMemberExportData(db: DbClient, memberId: string) {
  const memberData = await db.query.members.findFirst({
    where: eq(members.id, memberId),
  });

  if (!memberData) {
    return null;
  }

  const memberCards = await db.query.cards.findMany({
    where: eq(cards.memberId, memberId),
  });
  const memberSubscriptions = await db.query.subscriptions.findMany({
    where: eq(subscriptions.memberId, memberId),
  });
  const memberCompanies = await db.query.companies.findMany({
    where: eq(companies.ownerId, memberId),
  });
  const memberProfile = await db.query.profiles.findFirst({
    where: eq(profiles.memberId, memberId),
  });
  const memberLegalAcceptances = await db.query.legalAcceptances.findMany({
    where: eq(legalAcceptances.memberId, memberId),
  });
  const memberSessions = await db.query.sessions.findMany({
    where: eq(sessions.memberId, memberId),
  });
  const sentReferrals = await db.query.referrals.findMany({
    where: eq(referrals.senderId, memberId),
  });
  const memberDeletionRequests =
    await db.query.accountDeletionRequests.findMany({
      where: eq(accountDeletionRequests.memberId, memberId),
    });

  const companyIds = memberCompanies.map((company) => company.id);
  const receivedReferrals =
    companyIds.length > 0
      ? await db.query.referrals.findMany({
          where: inArray(referrals.recipientCompanyId, companyIds),
        })
      : [];

  return {
    exportDate: new Date().toISOString(),
    member: {
      id: memberData.id,
      createdAt: memberData.createdAt,
      updatedAt: memberData.updatedAt,
      phone: memberData.phone,
      displayName: memberData.displayName,
      locale: memberData.locale,
      country: memberData.country,
      language: memberData.language,
      status: memberData.status,
      role: memberData.role,
      canSendReferrals: memberData.canSendReferrals,
      totpEnabled: memberData.totpEnabled,
    },
    profile: memberProfile,
    cards: memberCards.map((card) => ({
      id: card.id,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
      serial: card.serial,
      tier: card.tier,
      status: card.status,
      issuedAt: card.issuedAt,
    })),
    subscriptions: memberSubscriptions,
    companies: memberCompanies,
    referrals: {
      sent: sentReferrals,
      receivedForOwnedCompanies: receivedReferrals,
    },
    legalAcceptances: memberLegalAcceptances,
    accountDeletionRequests: memberDeletionRequests,
    sessions: memberSessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      lastSeenAt: session.lastSeenAt,
      isPartialSession: session.isPartialSession,
    })),
  };
}
