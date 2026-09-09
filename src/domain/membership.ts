/**
 * Whether a member may be inside the club at all (FR-103, FR-107, ADR 0033).
 *
 * Pure, and here rather than in the billing module, for the same reason
 * `sign-in.ts` is: it is the rule with the most ways to be quietly wrong, and
 * the service that would otherwise hold it cannot be tested without a database.
 *
 * The rule reads two things and nothing else: which kind of membership the row
 * says this member holds, and what Stripe currently says about their
 * subscriptions. It never reads a checkout redirect, a session flag or anything
 * the browser sent (ADR 0004).
 */

import { ACCESS_GRANTING_SUBSCRIPTION_STATUSES } from "./subscription-access";

/** Who owes membership dues. Mirrors `members.dues_kind`. */
export type MemberDuesKind = "paying" | "sponsored" | "legacy_free";

export type MembershipAccess = "active" | "awaiting_payment";

/** Everything this rule needs to know about one subscription. */
export interface MembershipSubscription {
  plan: "membership" | "vip" | "listing";
  status: string;
}

/**
 * `awaiting_payment` means exactly one screen is reachable, and it is the one
 * that asks for the money.
 *
 * A `paying` member keeps access through `past_due`, because FR-056 keeps it:
 * Stripe is still retrying, the member has not lost anything, and the card
 * tier makes the same judgement from the same list of statuses. Reading it any
 * other way would lock out a member mid-dunning — money and access disagreeing,
 * which is the one thing ADR 0004 exists to prevent.
 */
export function membershipAccess(
  member: { duesKind: MemberDuesKind },
  subscriptions: readonly MembershipSubscription[],
): MembershipAccess {
  if (member.duesKind !== "paying") return "active";

  const paidUp = subscriptions.some(
    (subscription) =>
      subscription.plan === "membership" &&
      ACCESS_GRANTING_SUBSCRIPTION_STATUSES.includes(subscription.status),
  );

  return paidUp ? "active" : "awaiting_payment";
}
