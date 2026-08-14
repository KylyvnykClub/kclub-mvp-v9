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
}
