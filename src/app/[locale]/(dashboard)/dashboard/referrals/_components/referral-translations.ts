export type ReferralStatus =
  | "pending_review"
  | "rejected"
  | "delivered"
  | "accepted"
  | "declined"
  | "expired";

export interface ReferralTranslations {
  clientName: string;
  serviceNeeded: string;
  note: string;
  status: Record<ReferralStatus, string>;
  accept: string;
  decline: string;
  contactChannel: string;
  contactRevealedAfterAccept: string;
}
