import { createHash } from "node:crypto";

export type CheckoutPlan = "vip" | "listing";

export interface CheckoutPriceConfig {
  vipPriceId?: string;
  legacyVipPriceId?: string;
  businessPriceId?: string;
  legacyBusinessPriceId?: string;
}

export function resolveCheckoutPriceId(
  plan: CheckoutPlan,
  config: CheckoutPriceConfig,
): string {
  const priceId =
    plan === "vip"
      ? (config.vipPriceId ?? config.legacyVipPriceId)
      : (config.businessPriceId ?? config.legacyBusinessPriceId);

  if (!priceId) {
    throw new Error(`${plan} checkout price is not configured`);
  }

  return priceId;
}

export function checkoutIdempotencyKey(input: {
  memberId: string;
  plan: CheckoutPlan;
  priceId: string;
  companyId?: string;
  now?: Date;
}): string {
  const minuteBucket = Math.floor(
    (input.now?.getTime() ?? Date.now()) / 60_000,
  );
  const fingerprint = createHash("sha256")
    .update(
      [
        "kclub.checkout.v1",
        input.memberId,
        input.plan,
        input.priceId,
        input.companyId ?? "",
        String(minuteBucket),
      ].join(":"),
    )
    .digest("hex")
    .slice(0, 32);

  return `kclub_${input.plan}_${fingerprint}`;
}
