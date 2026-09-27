import type { DbClient } from "./db";
import { listMemberSubscriptionPlans } from "./billing";
import { memberIsPaidByHold } from "./listing-holds";
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
