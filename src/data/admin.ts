import { and, count, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import type { DbClient } from "./db";
import { companies, members, referrals, subscriptions } from "./schema";

export async function getAdminDashboardMetrics(db: DbClient) {
  const [activeVipResult] = await db
    .select({ value: count() })
    .from(subscriptions)
    .where(
      and(eq(subscriptions.status, "active"), isNull(subscriptions.companyId)),
    );

  const activeVip = activeVipResult.value;

  const [activeCompanyResult] = await db
    .select({ value: count() })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "active"),
        isNotNull(subscriptions.companyId),
      ),
    );

  const activeCompany = activeCompanyResult.value;

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

  const renewalsDue = renewalsResult.value;

  return { activeVip, activeCompany, renewalsDue };
}

export async function getAdminSupportMetrics(db: DbClient) {
  const [totalMembersResult] = await db
    .select({ value: count() })
    .from(members);
  const totalMembers = totalMembersResult.value;

  const [activeMembersResult] = await db
    .select({ value: count() })
    .from(members)
    .where(eq(members.status, "active"));
  const activeMembers = activeMembersResult.value;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const [newMembersResult] = await db
    .select({ value: count() })
    .from(members)
    .where(gte(members.createdAt, sevenDaysAgo));
  const newMembers = newMembersResult.value;

  const [pendingCompaniesResult] = await db
    .select({ value: count() })
    .from(companies)
    .where(eq(companies.moderationStatus, "pending"));
  const pendingCompanies = pendingCompaniesResult.value;

  const [pendingReferralsResult] = await db
    .select({ value: count() })
    .from(referrals)
    .where(eq(referrals.status, "pending"));
  const pendingReferrals = pendingReferralsResult.value;

  return {
    totalMembers,
    activeMembers,
    newMembers,
    pendingCompanies,
    pendingReferrals,
  };
}
