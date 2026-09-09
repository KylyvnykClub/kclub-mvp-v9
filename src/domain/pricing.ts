/**
 * What the club charges, in integer minor units (requirements.md §4.5).
 *
 * One place, so a price shown on the pricing page, on the dues screen and on
 * the VIP button cannot disagree with each other. It is deliberately *not* the
 * source of truth for what a member is actually charged: that is the Stripe
 * price behind the `plan_prices` row (FR-059), and Stripe is what takes the
 * money. These are the launch amounts as published, and changing a price in the
 * console without changing them here leaves the copy lying — which is why they
 * live in one file rather than in nine translation strings.
 *
 * Minor units and never a float: no floating point ever reaches an amount.
 */

export const CURRENCY = "USD";

export type PricedPlan = "membership" | "vip" | "listing";

export const MONTHLY_PRICE_MINOR: Record<PricedPlan, number> = {
  /** Standard membership dues (FR-102, ADR 0033). */
  membership: 499,
  /** VIP membership (FR-050). */
  vip: 1999,
  /** One published company listing (FR-051). */
  listing: 1999,
};

/**
 * `$4.99` — the amount with its currency, in the reader's locale.
 *
 * requirements.md §4.5 asks for an explicit `$` and an explicit currency label
 * wherever a price is shown; the label is copy, so this renders the amount and
 * the screen says "USD" beside it.
 */
export function formatPrice(
  amountMinor: number,
  locale: string,
  currency: string = CURRENCY,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

export function monthlyPrice(plan: PricedPlan, locale: string): string {
  return formatPrice(MONTHLY_PRICE_MINOR[plan], locale);
}
