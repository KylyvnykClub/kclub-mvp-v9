/**
 * Sending limits for client referrals (FR-073).
 *
 * Kept out of the Server Action file so the arithmetic can be tested directly
 * rather than only by driving twenty-odd referrals through a session. The
 * limits are part of what makes this feature structurally not a referral
 * scheme - see [ADR 0009](../../docs/decisions/0009-referral-data-minimisation.md)
 * - so they are worth being able to read in one place.
 */

/** Referrals a sender may send in any rolling 24 hours. */
export const REFERRAL_DAILY_LIMIT = 10;

/** Referrals a sender may send to one recipient company in the same window. */
export const REFERRAL_PER_RECIPIENT_DAILY_LIMIT = 3;

export const REFERRAL_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ReferralLimitBreach =
  { exceeded: false } | { exceeded: true; limit: "daily" | "per_recipient" };

/**
 * Decide whether one more referral may be sent, given the sender's referrals
 * inside the window.
 *
 * `recent` is expected to be already filtered to the window and to the sender;
 * this function does not re-check either, because the query that produced it
 * is the thing that owns that filter.
 */
export function checkReferralLimits(
  recent: readonly { recipientCompanyId: string }[],
  recipientCompanyId: string,
): ReferralLimitBreach {
  if (recent.length >= REFERRAL_DAILY_LIMIT) {
    return { exceeded: true, limit: "daily" };
  }

  const toSameRecipient = recent.filter(
    (referral) => referral.recipientCompanyId === recipientCompanyId,
  );

  if (toSameRecipient.length >= REFERRAL_PER_RECIPIENT_DAILY_LIMIT) {
    return { exceeded: true, limit: "per_recipient" };
  }

  return { exceeded: false };
}

/** The start of the rolling window, given the current time. */
export function referralWindowStart(now: Date): Date {
  return new Date(now.getTime() - REFERRAL_WINDOW_MS);
}
