import { and, asc, eq, ne } from "drizzle-orm";

import type { DbClient } from "./db";
import { listMemberSubscriptionPlans } from "./billing";
import { memberIsPaidByHold } from "./listing-holds";
import { companies } from "./schema";
import { buildActor, staffAtLeast } from "@/domain/actor";
import {
  membershipAccess,
  type MemberDuesKind,
  type MembershipAccess,
} from "@/domain/membership";

/**
 * Everything `membershipAccess` reads, loaded in one place (FR-103, FR-110).
 *
 * A gate does not call this directly: it calls `awaitsPaymentOutsideClub`,
 * which adds the staff exemption (ADR 0007). Two gates that called this one
 * disagreed about staff.
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
 * Whether this member stands outside the club, waiting to pay - the question
 * the dashboard gate, the pricing page, the partner page and the listing hold's
 * return address all ask. Staff are never outside (ADR 0007: a staff account
 * is not a club membership), so every caller gets the same answer.
 */
export async function awaitsPaymentOutsideClub(
  db: DbClient,
  member: {
    id: string;
    duesKind: MemberDuesKind;
    role: Parameters<typeof buildActor>[0]["role"];
  },
  now: Date,
): Promise<boolean> {
  if (staffAtLeast(buildActor(member), "staff_support")) {
    return false;
  }
  return (await loadMembershipAccess(db, member, now)) === "awaiting_payment";
}

/**
 * Whether the member has an application that is still alive - pending or
 * approved. A rejected one does not stop them applying again. A plain EXISTS,
 * not the relational load the company screens use.
 */
export async function ownsLiveApplication(
  db: DbClient,
  memberId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(
      and(
        eq(companies.ownerId, memberId),
        ne(companies.moderationStatus, "rejected"),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * The owner's applications, oldest first, with only what the standing screen
 * reads - not the relational load (categories, countries, images) the company
 * screens need. The dues screen is where every unpaid member lands.
 */
export async function listOwnApplications(db: DbClient, ownerId: string) {
  return db
    .select({
      id: companies.id,
      name: companies.name,
      rejectionReason: companies.rejectionReason,
      moderationStatus: companies.moderationStatus,
    })
    .from(companies)
    .where(eq(companies.ownerId, ownerId))
    .orderBy(asc(companies.createdAt), asc(companies.id));
}
