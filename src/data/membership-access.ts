import { and, eq, notExists, sql } from "drizzle-orm";

import type { DbClient } from "./db";
import { listMemberSubscriptionPlans } from "./billing";
import { memberIsPaidByHold } from "./listing-holds";
import { companies, members, subscriptions } from "./schema";
import {
  membershipAccess,
  type MemberDuesKind,
  type MembershipAccess,
} from "@/domain/membership";

/**
 * Everything `membershipAccess` reads, loaded in one place (FR-103, FR-110).
 *
 * Every gate calls this rather than assembling the inputs itself: a gate that
 * forgot the listing hold would lock out a partner who has paid for their
 * first month (ADR 0037), and two hand-written copies are how one of them
 * forgets.
 */
export async function loadMembershipAccess(
  db: DbClient,
  member: { id: string; duesKind: MemberDuesKind },
  now: Date,
): Promise<MembershipAccess> {
  const [subscriptions, paidByHold] = await Promise.all([
    listMemberSubscriptionPlans(db, member.id),
    member.duesKind === "partner"
      ? memberIsPaidByHold(db, member.id, now)
      : Promise.resolve(false),
  ]);

  return membershipAccess(member, subscriptions, paidByHold);
}

/**
 * Who may turn a member account into a partner account: registered as a
 * paying member, never subscribed to membership or VIP, and owning no company.
 * Such an account has never been in the club, so being a business instead -
 * paying for the listing rather than the dues (ADR 0036, FR-110) - takes
 * nothing away and grants nothing until the listing is paid.
 */
function partnerConvertible(memberId: string) {
  return and(
    eq(members.id, memberId),
    eq(members.duesKind, "paying"),
    notExists(
      sql`(SELECT 1 FROM ${subscriptions} WHERE ${subscriptions.memberId} = ${memberId} AND ${subscriptions.plan} IN ('membership', 'vip'))`,
    ),
    notExists(
      sql`(SELECT 1 FROM ${companies} WHERE ${companies.ownerId} = ${memberId})`,
    ),
  );
}

export async function memberCanBecomePartner(
  db: DbClient,
  memberId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: members.id })
    .from(members)
    .where(partnerConvertible(memberId))
    .limit(1);
  return row !== undefined;
}

/**
 * Make the account a partner account, once, and only while the rule above
 * holds - checked in the UPDATE itself, so a subscription that lands between
 * the check and the write cannot be overtaken.
 */
export async function convertToPartnerAccount(
  db: DbClient,
  memberId: string,
): Promise<boolean> {
  const changed = await db
    .update(members)
    .set({ duesKind: "partner", updatedAt: new Date() })
    .where(partnerConvertible(memberId))
    .returning({ id: members.id });
  return changed.length > 0;
}
