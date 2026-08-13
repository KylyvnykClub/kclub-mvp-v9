import { env } from "@/env";
import { findActivePlanPrice } from "@/data/plan-prices";
import type { DbClient } from "@/data/db";
import {
  type CheckoutPlan,
  resolveCheckoutPriceId,
} from "@/modules/billing/checkout";

export function configuredCheckoutPriceId(plan: CheckoutPlan): string {
  return resolveCheckoutPriceId(plan, {
    vipPriceId: env.server.STRIPE_VIP_PRICE_ID,
    legacyVipPriceId: env.server.NEXT_PUBLIC_STRIPE_VIP_PRICE_ID,
    listingPriceId: env.server.STRIPE_LISTING_PRICE_ID,
    legacyListingPriceId: env.server.NEXT_PUBLIC_STRIPE_LISTING_PRICE_ID,
  });
}

export async function checkoutPriceIdForPlan(
  db: DbClient,
  plan: CheckoutPlan,
): Promise<string> {
  const databasePrice = await findActivePlanPrice(db, plan);
  if (databasePrice) return databasePrice;

  return configuredCheckoutPriceId(plan);
}
