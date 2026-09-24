/**
 * Whether a listing may be paid for yet (FR-051, FR-111, ADR 0036).
 *
 * Pure, and its own module, because it is the rule the client asked for in one
 * sentence — "money is not taken until a human has checked the business" — and
 * a rule stated that plainly should be readable in one place rather than
 * inferred from an `if` inside a Stripe call.
 *
 * It is deliberately narrow: it answers when a charge may be *offered*, not
 * whether a listing is published. Publication is a separate conjunction,
 * approved AND an access-granting subscription, evaluated at read time
 * (FR-044). This says only that the first of those two must come first.
 */

export type ListingCheckoutEligibility =
  /** Approved by a moderator; the price may be charged. */
  | "eligible"
  /** Submitted and waiting. Nothing has been charged and nothing may be. */
  | "awaiting_moderation"
  /** Refused. There is nothing to sell, so there is nothing to charge for. */
  | "rejected"
  /** No such company, or not this caller's. */
  | "unknown";

export function listingCheckoutEligibility(
  company: { moderationStatus: string } | null | undefined,
): ListingCheckoutEligibility {
  if (!company) return "unknown";

  switch (company.moderationStatus) {
    case "approved":
      return "eligible";
    case "rejected":
      return "rejected";
    default:
      // Anything that is not one of the two decisions is a decision not yet
      // made. Defaulting this way is what makes an unexpected status safe:
      // a new moderation state added later cannot accidentally become payable.
      return "awaiting_moderation";
  }
}

/** Shorthand for the one branch that may open Stripe. */
export function listingIsPayable(
  company: { moderationStatus: string } | null | undefined,
): boolean {
  return listingCheckoutEligibility(company) === "eligible";
}
