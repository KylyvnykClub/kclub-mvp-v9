/**
 * Outbox contract between the moderation use cases (which enqueue) and the
 * drain worker (which notifies). Lives outside the "use server" action file so
 * both sides import the same literal instead of keeping private copies.
 */
export const COMPANY_MODERATION_TOPIC = "company.moderation";

export interface CompanyModerationPayload {
  companyId?: string;
  status?: string;
  reason?: string | null;
  /**
   * An approval that found the price held on the partner's card and asked
   * Stripe to capture it (ADR 0037). The email then says the payment is being
   * taken rather than asking for it.
   */
  paymentHeld?: boolean;
}
