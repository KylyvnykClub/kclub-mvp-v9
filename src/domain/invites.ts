/**
 * The invite matrix (ADR 0042, FR-123, FR-124).
 *
 * Who a member is decides what a newcomer brought through their link pays.
 * Pure, so every cell of the matrix is a unit test; the data layer only loads
 * the three facts below.
 *
 * |Inviter          |partner link |member link|
 * |-----------------|-------------|-----------|
 * |business partner |free listing |free dues  |
 * |VIP member       |free listing |free dues  |
 * |club member      |free listing |paid       |
 *
 * An inviter outside the club - blocked, erased, or awaiting payment - has no
 * standing at all, and their link does nothing. If everything becomes paid,
 * `inviteGrantsWaiver` changes and the schema does not.
 */

import type { MembershipSubscription } from "./membership";
import { ACCESS_GRANTING_SUBSCRIPTION_STATUSES } from "./subscription-access";

/** Mirrors `invite_link_kind`. */
export type InviteLinkKind = "member" | "partner";

/** Mirrors `inviter_standing`. */
export type InviterStanding = "partner" | "vip" | "member";

export const INVITE_LINK_KINDS: readonly InviteLinkKind[] = [
  "member",
  "partner",
];

export interface InviterFacts {
  /** Not blocked, not erased, and `membershipAccess` says active. */
  inClub: boolean;
  /** Owns an approved company whose listing is paid for or waived. */
  ownsPaidListing: boolean;
  /** The member's subscriptions as Stripe last reported them. */
  subscriptions: readonly MembershipSubscription[];
}

/**
 * The inviter's standing now, or `null` when their link must do nothing. A
 * business partner outranks a VIP only for the record: the two waive the same.
 */
export function inviterStanding(facts: InviterFacts): InviterStanding | null {
  if (!facts.inClub) return null;
  if (facts.ownsPaidListing) return "partner";

  const vip = facts.subscriptions.some(
    (subscription) =>
      subscription.plan === "vip" &&
      ACCESS_GRANTING_SUBSCRIPTION_STATUSES.includes(subscription.status),
  );
  return vip ? "vip" : "member";
}

/** Whether a newcomer brought through this kind of link is waived. */
export function inviteGrantsWaiver(
  standing: InviterStanding,
  kind: InviteLinkKind,
): boolean {
  if (kind === "partner") return true;
  return standing === "partner" || standing === "vip";
}
