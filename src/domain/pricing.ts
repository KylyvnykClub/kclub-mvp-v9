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

/** What a pricing button needs to know about whoever is reading the page. */
export type PricingReader =
  | { signedIn: false }
  | {
      signedIn: true;
      /** Dues (or, for a partner, the listing) not yet paid: FR-103's gate. */
      awaitingPayment: boolean;
      /** Owns at least one company, pending or live. */
      ownsCompany: boolean;
    };

/**
 * Where each pricing button leads, so that it arrives at the price it names.
 *
 * An unpaid member used to be sent into the dashboard, which the dues gate
 * turned into the $4.99 screen whichever plan they had picked.
 *
 * - VIP includes membership (ADR 0043), so a visitor who picked it registers
 *   and lands on the dues screen with VIP offered first, and an unpaid member
 *   goes straight there. A paid one switches to it under Billing.
 * - The listing is its own payment (ADR 0037). An unpaid member with no
 *   company applies on /partner; one who already has a company reserves its
 *   price on the dues screen, which shows its standing. A paid member files
 *   from the dashboard, where their draft lives.
 */
export function pricingDestinations(
  reader: PricingReader,
  locale: string,
): Record<PricedPlan, string> {
  if (!reader.signedIn) {
    return {
      membership: `/${locale}/register`,
      vip: `/${locale}/register?plan=vip`,
      listing: `/${locale}/partner`,
    };
  }

  if (reader.awaitingPayment) {
    return {
      membership: `/${locale}/membership`,
      vip: `/${locale}/membership?plan=vip`,
      listing: reader.ownsCompany
        ? `/${locale}/membership`
        : `/${locale}/partner`,
    };
  }

  return {
    membership: `/${locale}/membership`,
    vip: `/${locale}/dashboard/profile?tab=billing`,
    listing: `/${locale}/dashboard/company/new`,
  };
}
