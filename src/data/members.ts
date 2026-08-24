import { randomUUID } from "node:crypto";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { DbClient } from "./db";
import type { PageParams } from "./pagination";
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

/**
 * The member's current card.
 *
 * A member can hold more than one card row once a card has been reissued, so
 * the order matters: a valid card wins over a revoked one, and the newest wins
 * among equals. Without it, which card the dashboard shows after a reissue
 * would be whatever the planner happened to return.
 */
export async function findCardByMemberId(db: DbClient, memberId: string) {
  const card = await db.query.cards.findFirst({
    where: eq(cards.memberId, memberId),
    orderBy: (table, { asc, desc }) => [
      asc(table.status),
      desc(table.issuedAt),
    ],
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

export const MEMBER_ADMIN_STATUSES = [
  "active",
  "blocked",
  "pending_deletion",
] as const;

export type MemberAdminStatus = (typeof MEMBER_ADMIN_STATUSES)[number];

export interface MemberAdminFilters {
  query?: string;
  status?: MemberAdminStatus;
}

const MEMBER_ADMIN_RELATIONS = {
  cards: true,
  subscriptions: {
    with: {
      company: true,
    },
  },
  profile: true,
} as const;

/**
 * One WHERE for the page of rows and for every count taken over it, so a
 * filter can never apply to one and not the other.
 *
 * The card-serial match is an EXISTS subquery rather than a second query
 * merged in memory: once the list is paginated, merging two result sets after
 * the fact pages over the wrong set and reports a total that disagrees with
 * the rows it returned.
 */
function memberAdminWhere(filters: MemberAdminFilters): SQL {
  const conditions: SQL[] = [inArray(members.role, CLUB_MEMBER_ROLES)];

  if (filters.query) {
    const pattern = `%${filters.query}%`;
    conditions.push(
      or(
        ilike(members.displayName, pattern),
        ilike(members.phone, pattern),
        // The subquery names its own columns rather than interpolating the
        // cards columns: inside a relational query drizzle rewrites embedded
        // column references to the outer query's alias, which silently turns
        // cards.member_id into members.member_id.
        sql`exists (select 1 from ${cards} as member_card where member_card.member_id = ${members.id} and member_card.serial ilike ${pattern})`,
      )!,
    );
  }

  if (filters.status) {
    conditions.push(eq(members.status, filters.status));
  }

  return and(...conditions)!;
}

export async function searchMembers(
  db: DbClient,
  filters: MemberAdminFilters = {},
  page: PageParams = { limit: 50, offset: 0 },
) {
  return db.query.members.findMany({
    where: memberAdminWhere(filters),
    with: MEMBER_ADMIN_RELATIONS,
    // Offset pagination over an unordered query silently repeats and skips
    // rows between pages; createdAt is not unique enough to sort on alone.
    orderBy: [desc(members.createdAt), desc(members.id)],
    limit: page.limit,
    offset: page.offset,
  });
}

export async function countMembers(
  db: DbClient,
  filters: MemberAdminFilters = {},
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(members)
    .where(memberAdminWhere(filters));

  return row?.value ?? 0;
}

/**
 * Counts for the status filter chips. Deliberately ignores the status filter
 * itself - a chip has to show what selecting it would find, not what the
 * current selection already narrowed the list to.
 */
export async function countMembersByStatus(
  db: DbClient,
  filters: Omit<MemberAdminFilters, "status"> = {},
): Promise<Record<MemberAdminStatus, number>> {
  const rows = await db
    .select({ status: members.status, value: count() })
    .from(members)
    .where(memberAdminWhere(filters))
    .groupBy(members.status);

  const counts: Record<MemberAdminStatus, number> = {
    active: 0,
    blocked: 0,
    pending_deletion: 0,
  };

  for (const row of rows) {
    counts[row.status] = row.value;
  }

  return counts;
}

export type MemberAdminView = Awaited<ReturnType<typeof searchMembers>>[number];

export async function findMemberAdminById(db: DbClient, memberId: string) {
  return db.query.members.findFirst({
    where: and(
      eq(members.id, memberId),
      inArray(members.role, CLUB_MEMBER_ROLES),
    ),
    with: MEMBER_ADMIN_RELATIONS,
  });
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

/**
 * Revoke every valid card a member holds, and return them.
 *
 * FR-025: a reissue must invalidate the previous QR token immediately. The
 * token is derived from the card id and cannot be withdrawn, so revoking the
 * row is what makes the old QR read as revoked at the verification page.
 */
export async function revokeValidCardsByMemberId(
  db: DbClient,
  memberId: string,
) {
  return db
    .update(cards)
    .set({ status: "revoked" })
    .where(and(eq(cards.memberId, memberId), eq(cards.status, "valid")))
    .returning();
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
