import {
  findListingActivation,
  findPaymentAuthority,
  findUnspentPartnerInvitation,
} from "@/data/business-applications";
import { listSubscriptionsByCompanyId } from "@/data/billing";
import type { DbClient } from "@/data/db";
import {
  isEuEeaResident,
  withdrawalWindowOpen,
} from "@/domain/business-application";
import type { PartnerPaymentStanding } from "@/domain/listing-hold";
import { LISTING_PUBLISHABLE_STATUSES } from "@/domain/subscription-access";
import { clubPartnerLinkPending } from "./partner-link-waiver";

/**
 * What the standing screens need beyond the standing itself (ADR 0044): the
 * partner's ways out, the dates, and whether an application filed before
 * consents were recorded still needs them. Serialisable, for a client
 * component.
 */
export interface ListingStandingExtras {
  /** No payment authority on record: show the boxes before Stripe. */
  consentNeeded: boolean;
  /** The terms those boxes are shown on. */
  consentTerms: {
    invited: boolean;
    waived: boolean;
    residenceCountry: string | null;
  };
  /** Before approval: the owner may withdraw the application. */
  canWithdrawApplication: boolean;
  /** An EU/EEA consumer inside 14 days of the consent. */
  euWithdrawalOpen: boolean;
  /** A subscription that will bill again and has not been told to stop. */
  canCancelRenewal: boolean;
  /** The renewal is cancelled; the listing ends at this moment. */
  renewalEndsAt: string | null;
  trialEndsAt: string | null;
  startNotBefore: string | null;
}

const ASKS_FOR_MONEY: readonly PartnerPaymentStanding[] = [
  "authorise",
  "pay",
  "save_card",
];

export async function listingStandingExtras(
  db: DbClient,
  company: {
    id: string;
    moderationStatus: string;
    withdrawnAt?: Date | null;
  },
  member: { id: string; country: string | null },
  standing: PartnerPaymentStanding,
  now: Date,
): Promise<ListingStandingExtras> {
  const [consent, subscriptions, activation, invitation, waived] =
    await Promise.all([
      findPaymentAuthority(db, company.id),
      listSubscriptionsByCompanyId(db, company.id),
      findListingActivation(db, company.id),
      findUnspentPartnerInvitation(db, member.id),
      clubPartnerLinkPending(db),
    ]);

  const live = subscriptions.find((subscription) =>
    LISTING_PUBLISHABLE_STATUSES.includes(subscription.status),
  );

  return {
    consentNeeded: ASKS_FOR_MONEY.includes(standing) && !consent,
    consentTerms: {
      invited: invitation !== undefined,
      waived,
      residenceCountry: member.country,
    },
    canWithdrawApplication:
      company.moderationStatus === "pending" && !company.withdrawnAt,
    euWithdrawalOpen:
      !company.withdrawnAt &&
      consent !== undefined &&
      isEuEeaResident(consent.residenceCountry) &&
      withdrawalWindowOpen(consent.acceptedAt, now),
    canCancelRenewal: live !== undefined && live.cancelAtPeriodEnd === null,
    renewalEndsAt: live?.cancelAtPeriodEnd?.toISOString() ?? null,
    trialEndsAt: activation?.trialEndsAt?.toISOString() ?? null,
    startNotBefore: activation?.startNotBefore?.toISOString() ?? null,
  };
}
