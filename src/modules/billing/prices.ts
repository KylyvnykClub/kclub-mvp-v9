import { env } from "@/env";
import {
  findActivePlanPrice,
  findPlanByStripePriceId,
} from "@/data/plan-prices";
import type { DbClient } from "@/data/db";
import {
  type CheckoutPlan,
  resolveCheckoutPriceId,
} from "@/modules/billing/checkout";

export function configuredCheckoutPriceId(plan: CheckoutPlan): string {
  return resolveCheckoutPriceId(plan, {
    membershipPriceId: env.server.STRIPE_MEMBER_PRICE_ID,
    vipPriceId: env.server.STRIPE_VIP_PRICE_ID,
    legacyVipPriceId: env.server.NEXT_PUBLIC_STRIPE_VIP_PRICE_ID,
    businessPriceId: env.server.STRIPE_BUSINESS_PRICE_ID,
    legacyBusinessPriceId: env.server.NEXT_PUBLIC_STRIPE_BUSINESS_PRICE_ID,
  });
}

/**
 * Whether this plan can be sold at all right now.
 *
 * The dues screen asks before it renders its button, because it is the only
 * screen an unpaid member can reach (FR-103): a missing price there is not one
 * broken button, it is a member with nowhere to go. Every other checkout is
 * reached from a screen the member can leave.
 */
export async function checkoutPriceIsConfigured(
  db: DbClient,
  plan: CheckoutPlan,
): Promise<boolean> {
  try {
    await checkoutPriceIdForPlan(db, plan);
    return true;
  } catch {
    return false;
  }
}

export async function checkoutPriceIdForPlan(
  db: DbClient,
  plan: CheckoutPlan,
): Promise<string> {
  const databasePrice = await findActivePlanPrice(db, plan);
  if (databasePrice) return databasePrice;

  return configuredCheckoutPriceId(plan);
}

/**
 * Which plan a projected subscription is for (ADR 0033).
 *
 * A company attached settles it: only a listing has one. For a member-scoped
 * subscription the price decides, read first from `plan_prices` — which holds
 * every price the club has ever sold, including the superseded ones a
 * long-running subscription is still on (FR-059) — and then from the
 * environment.
 *
 * The fallback is `vip`, because that is what every member-scoped subscription
 * was before dues existed: a database that predates this column and a Stripe
 * price nobody recorded resolve to the answer that was true then.
 */
export async function planForSubscription(
  db: DbClient,
  input: { priceId: string; companyId: string | null },
): Promise<"membership" | "vip" | "listing"> {
  if (input.companyId) return "listing";

  const recorded = await findPlanByStripePriceId(db, input.priceId);
  if (recorded === "membership" || recorded === "vip") return recorded;

  if (input.priceId && input.priceId === env.server.STRIPE_MEMBER_PRICE_ID) {
    return "membership";
  }

  return "vip";
}
