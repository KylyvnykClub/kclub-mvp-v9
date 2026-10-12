import { appendAuditEntry } from "@/data/audit-log";
import { softDeleteCompany } from "@/data/companies";
import type { DbClient } from "@/data/db";
import { enqueueOutbox } from "@/data/outbox";
import {
  cancelListingRenewal,
  productionListingCancellationDeps,
  type ListingCancellationDeps,
} from "@/modules/billing/listing-cancellation";
import { LISTING_ACTIVATION_EVENT_TOPIC } from "@/modules/billing/listing-activation";
import {
  LISTING_HOLD_SETTLE_TOPIC,
  productionListingHoldDeps,
  settleListingHolds,
  type ListingHoldDeps,
} from "@/modules/billing/listing-hold";

export type DeletingStaff = { id: string; role: string };

/** Stripe, injected for tests; production wiring when omitted. */
export type CompanyDeletionDeps = {
  holds: () => Promise<ListingHoldDeps>;
  cancellation: () => Promise<ListingCancellationDeps>;
};

const productionDeps: CompanyDeletionDeps = {
  holds: productionListingHoldDeps,
  cancellation: productionListingCancellationDeps,
};

/**
 * Staff delete a company (FR-046, data-storage.md §4).
 *
 * The company is rejected and marked deleted in one statement, audited in the
 * same transaction, so it leaves the catalogue and the console at once and no
 * approval can bring it back. The money then follows the hide path: an
 * uncaptured hold is released and the renewal is cancelled at the period end,
 * so nothing is billed again. A captured month is not refunded here - that is
 * a separate decision (refund.ts). Stripe being unreachable never undoes the
 * delete; each half is queued and retried from the outbox.
 */
export async function deleteCompanyForStaff(
  db: DbClient,
  companyId: string,
  staff: DeletingStaff,
  reason: string,
  now: Date,
  deps: CompanyDeletionDeps = productionDeps,
): Promise<boolean> {
  const deleted = await db.transaction(async (tx) => {
    const done = await softDeleteCompany(tx, companyId, reason, now);
    if (!done) return false;
    await appendAuditEntry(tx, {
      actorType: staff.role,
      actorId: staff.id,
      action: "company.deleted",
      subjectType: "company",
      subjectId: companyId,
      meta: { reason },
    });
    return true;
  });
  if (!deleted) return false;

  try {
    await settleListingHolds(db, await deps.holds(), companyId, now);
  } catch (error) {
    console.error(
      `[delete-company] hold release failed for ${companyId}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    await enqueueOutbox(db, LISTING_HOLD_SETTLE_TOPIC, { companyId });
  }

  try {
    const cancelled = await cancelListingRenewal(
      db,
      await deps.cancellation(),
      companyId,
    );
    if (cancelled.outcome === "cancelled") {
      await appendAuditEntry(db, {
        actorType: staff.role,
        actorId: staff.id,
        action: "company.listing_renewal_cancelled",
        subjectType: "company",
        subjectId: companyId,
        meta: { reason: "deleted", endsAt: cancelled.endsAt.toISOString() },
      });
    }
  } catch (error) {
    console.error(
      `[delete-company] renewal cancel failed for ${companyId}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    await enqueueOutbox(db, LISTING_ACTIVATION_EVENT_TOPIC, {
      type: "cancel_renewal",
      companyId,
    });
  }

  return true;
}
