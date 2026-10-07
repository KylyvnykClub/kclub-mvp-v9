/**
 * Pure billing access and dunning rules, deliberately free of any database or
 * environment import so they can be unit-tested without a connection.
 * data/billing.ts re-exports these, so the public import path stays
 * `@/data/billing`.
 */

/**
 * The single definition of "a subscription that grants access" now lives in
 * `@/domain/subscription-access`, because the membership rule that also needs
 * it is domain code and may not import from this layer (ADR 0033). It is
 * re-exported here so every existing caller keeps importing it from
 * `@/data/billing`.
 *
 * The entitlement projection reads it to set a member's card tier, and
 * `listActiveSubscriptionsForDeletion` reads it to decide which subscriptions a
 * member still holds. Money and access must never disagree (ADR 0004), so the
 * rule lives in one place with a test rather than being copied per call site.
 */
export { ACCESS_GRANTING_SUBSCRIPTION_STATUSES } from "@/domain/subscription-access";

import { ACCESS_GRANTING_SUBSCRIPTION_STATUSES } from "@/domain/subscription-access";

/**
 * VIP while the subscription status grants access, free for every terminal or
 * lapsed status. Whichever end-of-dunning action Stripe is configured with -
 * `cancel the subscription` (→ `deleted`) or `mark as unpaid` (→ `unpaid`) -
 * resolves to `free` here, so a failed payment always loses access.
 */
export function tierForSubscriptionStatus(status: string): "vip" | "free" {
  return ACCESS_GRANTING_SUBSCRIPTION_STATUSES.includes(status)
    ? "vip"
    : "free";
}

/**
 * What a member is currently paying for - or that they owe and have not paid.
 *
 * `vip` is the VIP subscription (FR-050), which includes membership
 * (ADR 0043); `member` is standard membership dues (FR-102) without it;
 * `business` is a company listing (FR-051), which belongs to a company the
 * member owns, so it can sit beside either. `unpaid` is a `paying` member
 * with neither dues nor VIP - registered, held on the payment screen, not in
 * the club (FR-103). `free` is everyone else: let in without dues by the join
 * link or the invite programme, here before dues existed, or a partner whose
 * listing is not (or need not be) paid.
 *
 * Dues used to be left out, so the console showed "Free" both for a member
 * paying $4.99 and for one who had registered and never paid. The client read
 * the second as somebody let in without paying, which is the misreading this
 * column exists to prevent.
 *
 * Read from the subscription's own `plan` since ADR 0033, and from
 * `ACCESS_GRANTING_SUBSCRIPTION_STATUSES` rather than `status === "active"`,
 * which matters during dunning: FR-056 keeps access through `past_due` while
 * Stripe retries. Reading it any other way would show staff `unpaid` for
 * someone who has paid and has not lost anything.
 */
export type MemberPlan = "vip" | "member" | "business" | "unpaid" | "free";

export function memberPlansOf(
  member: { duesKind: string },
  subscriptions: readonly { plan: string; status: string }[],
): MemberPlan[] {
  const paid = subscriptions.filter((subscription) =>
    ACCESS_GRANTING_SUBSCRIPTION_STATUSES.includes(subscription.status),
  );
  const holds = (plan: string) =>
    paid.some((subscription) => subscription.plan === plan);

  const plans: MemberPlan[] = [];
  if (holds("vip")) {
    plans.push("vip");
  } else if (holds("membership")) {
    plans.push("member");
  } else if (member.duesKind === "paying") {
    plans.push("unpaid");
  }
  // Beside the dues answer, not instead of it: an unpaid member with a
  // listing reads "unpaid, business", and both are true.
  if (holds("listing")) plans.push("business");

  return plans.length > 0 ? plans : ["free"];
}

/**
 * FR-056: the dunning window Stripe retries a failed payment across. This MUST
 * match the Stripe Smart Retries schedule in the dashboard (Settings → Billing →
 * Manage failed payments): today "retry up to 8 times within 2 weeks", with the
 * end-of-retries action set to cancel the subscription. If that schedule
 * changes, change this too - a shorter Stripe window cancels access before the
 * grace warning fires; a longer one warns and then keeps access past the window.
 * The coupling is not enforceable from code (it is a dashboard setting), so it
 * is pinned by a test and documented in docs/integration.md. See the backlog
 * item stripe-dunning-settings-are-config-not-code.
 */
export const GRACE_PERIOD_DAYS = 14;
