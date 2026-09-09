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
 * What a member is currently paying for.
 *
 * `vip` is the VIP subscription (FR-050); `business` is a company listing
 * (FR-051), which belongs to a company the member owns, so a member can hold
 * both at once and this returns both. `free` means neither.
 *
 * Read from the subscription's own `plan` since ADR 0033. It used to read "no
 * company attached" as VIP, which stopped being true the moment membership
 * dues became a member-scoped subscription too: every member paying $4.99
 * would have been handed the VIP entitlement. Dues are deliberately not a chip
 * here - the console's three chips still mean VIP, listing and neither.
 *
 * Derived from `ACCESS_GRANTING_SUBSCRIPTION_STATUSES` rather than from
 * `status === "active"`, which matters during dunning: FR-056 keeps access
 * through `past_due` while Stripe retries, so a member in the grace window is
 * still VIP. Reading it any other way would show staff `free` for someone who
 * has paid and has not lost anything - money and access disagreeing on a
 * screen instead of in the database.
 */
export type MemberPlan = "vip" | "business" | "free";

export function memberPlansOf(
  subscriptions: readonly { plan: string; status: string }[],
): MemberPlan[] {
  const paid = subscriptions.filter((subscription) =>
    ACCESS_GRANTING_SUBSCRIPTION_STATUSES.includes(subscription.status),
  );

  const plans: MemberPlan[] = [];
  if (paid.some((subscription) => subscription.plan === "vip")) {
    plans.push("vip");
  }
  if (paid.some((subscription) => subscription.plan === "listing")) {
    plans.push("business");
  }

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
