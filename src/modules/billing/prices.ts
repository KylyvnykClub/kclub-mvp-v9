import { env } from "@/env";
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
