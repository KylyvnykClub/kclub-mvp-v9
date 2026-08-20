import {
  and,
  count,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import type { DbClient } from "./db";
import { companies, members, referrals, subscriptions } from "./schema";

const CLUB_MEMBER_ROLES = [
  "member",
  "member_vip",
  "partner_owner",
  "user",
] as const;

function countValue(row: { value: number } | undefined): number {
  return row?.value ?? 0;
}

export async function getAdminDashboardMetrics(db: DbClient) {
  const [activeVipResult] = await db
    .select({ value: count() })
    .from(subscriptions)
    .where(
      and(eq(subscriptions.status, "active"), isNull(subscriptions.companyId)),
    );

  const activeVip = countValue(activeVipResult);

  const [activeCompanyResult] = await db
    .select({ value: count() })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "active"),
        isNotNull(subscriptions.companyId),
      ),
    );

  const activeCompany = countValue(activeCompanyResult);

  // Renewals due in 7 days
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);

  const [renewalsResult] = await db
    .select({ value: count() })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "active"),
        lte(subscriptions.currentPeriodEnd, nextWeek),
      ),
    );

  const renewalsDue = countValue(renewalsResult);

  return { activeVip, activeCompany, renewalsDue };
}

export interface RegistrationsByDay {
  date: string;
  members: number;
  companies: number;
}

/**
 * FR-036-adjacent: a display aggregate, not a billing-grade count. Fills
 * every day in the window with zeros first so the chart's x-axis stays
 * evenly spaced even when a day had no activity.
 */
export async function getRegistrationsByDay(
  db: DbClient,
  days: number,
): Promise<RegistrationsByDay[]> {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const byDay = new Map<string, RegistrationsByDay>();
  for (let i = 0; i < days; i++) {
    const day = new Date(since);
    day.setDate(day.getDate() + i);
    const key = day.toISOString().slice(0, 10);
    byDay.set(key, { date: key, members: 0, companies: 0 });
  }

  const memberRows = await db
    .select({
      date: sql<string>`to_char(date_trunc('day', ${members.createdAt}), 'YYYY-MM-DD')`,
      value: count(),
    })
    .from(members)
    .where(
      and(
        inArray(members.role, CLUB_MEMBER_ROLES),
        gte(members.createdAt, since),
      ),
    )
    .groupBy(sql`1`);

  for (const row of memberRows) {
    const bucket = byDay.get(row.date);
    if (bucket) bucket.members = row.value;
  }

  const companyRows = await db
    .select({
      date: sql<string>`to_char(date_trunc('day', ${companies.createdAt}), 'YYYY-MM-DD')`,
      value: count(),
    })
    .from(companies)
    .where(gte(companies.createdAt, since))
    .groupBy(sql`1`);

  for (const row of companyRows) {
    const bucket = byDay.get(row.date);
    if (bucket) bucket.companies = row.value;
  }

  return Array.from(byDay.values());
}

export async function getAdminSupportMetrics(db: DbClient) {
  const [totalMembersResult] = await db
    .select({ value: count() })
    .from(members)
    .where(inArray(members.role, CLUB_MEMBER_ROLES));
  const totalMembers = countValue(totalMembersResult);

  const [activeMembersResult] = await db
    .select({ value: count() })
    .from(members)
    .where(
      and(
        inArray(members.role, CLUB_MEMBER_ROLES),
        eq(members.status, "active"),
      ),
    );
  const activeMembers = countValue(activeMembersResult);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const [newMembersResult] = await db
    .select({ value: count() })
    .from(members)
    .where(
      and(
        inArray(members.role, CLUB_MEMBER_ROLES),
        gte(members.createdAt, sevenDaysAgo),
      ),
    );
  const newMembers = countValue(newMembersResult);

  const [pendingCompaniesResult] = await db
    .select({ value: count() })
    .from(companies)
    .where(eq(companies.moderationStatus, "pending"));
  const pendingCompanies = countValue(pendingCompaniesResult);

  const [pendingReferralsResult] = await db
    .select({ value: count() })
    .from(referrals)
    .where(eq(referrals.status, "pending_review"));
  const pendingReferrals = countValue(pendingReferralsResult);

  return {
    totalMembers,
    activeMembers,
    newMembers,
    pendingCompanies,
    pendingReferrals,
  };
}
