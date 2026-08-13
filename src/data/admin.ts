import {
  and,
  count,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
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
