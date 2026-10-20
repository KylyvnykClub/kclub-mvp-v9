import type { DbClient } from "@/data/db";
import { appendAuditEntry } from "@/data/audit-log";
import { eraseMemberTx } from "@/data/account-erasure";
import { listOwnedCompanyIds } from "@/data/companies";
import { listCompanyImageRefsByOwner } from "@/data/company-images";
import {
  eraseStripeCustomerForMember,
  type CustomerDeleter,
  type SubscriptionCanceller,
} from "@/modules/billing/erasure";

/** The R2 objects a member leaves behind, collected before the rows go. */
export type MemberMedia = {
  memberId: string;
  galleryRefs: { companyId: string; imageId: string }[];
  companyIds: string[];
};

export type MemberErasureDeps = {
  cancelSubscription: SubscriptionCanceller;
  deleteCustomer: CustomerDeleter;
  deleteMedia: (media: MemberMedia) => Promise<void>;
};

/** Who closed the request: the day-30 job, or a staff owner who did not wait. */
export type ErasureTrigger =
  | { actorType: "system" }
  | { actorType: string; actorId: string; reason: string };

/**
 * Erase one member (FR-009, data-storage.md §4) - the single path both the
 * retention job and a staff owner's "erase now" take, so the two can never
 * erase differently.
 *
 * Order is the procedure's: Stripe first, then the database in one
 * transaction, then media best-effort, then the audit entry by internal id
 * only. A Stripe failure throws before anything is erased, so the request
 * stays open and the next attempt starts from the top.
 */
export async function eraseMember(
  db: DbClient,
  deps: MemberErasureDeps,
  params: {
    memberId: string;
    requestedAt: Date;
    now: Date;
    trigger: ErasureTrigger;
  },
): Promise<void> {
  const { memberId, requestedAt, now, trigger } = params;

  await eraseStripeCustomerForMember(db, deps, memberId);

  // Collected before eraseMemberTx deletes the rows - afterwards the R2
  // keys would no longer be derivable (ADR 0022).
  const media: MemberMedia = {
    memberId,
    galleryRefs: await listCompanyImageRefsByOwner(db, memberId),
    companyIds: await listOwnedCompanyIds(db, memberId),
  };

  await eraseMemberTx(db, memberId, now);

  // An R2 object nobody references anymore is not worth failing an erasure
  // that already happened over (ADR 0021-0023).
  try {
    await deps.deleteMedia(media);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[erasure] media object deletion failed: ${message}`);
  }

  await appendAuditEntry(db, {
    actorType: trigger.actorType,
    ...("actorId" in trigger ? { actorId: trigger.actorId } : {}),
    action: "member.erased",
    subjectType: "member",
    subjectId: memberId,
    meta: {
      requestedAt: requestedAt.toISOString(),
      erasedAt: now.toISOString(),
      ...("reason" in trigger ? { early: true, reason: trigger.reason } : {}),
    },
  });
}

/** Stripe and R2 as production has them. */
export async function productionMemberErasureDeps(): Promise<MemberErasureDeps> {
  const [
    { default: StripeClient },
    { env },
    { deleteAvatar },
    { deleteCompanyImage, deleteCompanyLogo },
  ] = await Promise.all([
    import("stripe"),
    import("@/env"),
    import("@/modules/platform/avatar-storage"),
    import("@/modules/platform/company-image-storage"),
  ]);
  const stripe = new StripeClient(env.server.STRIPE_SECRET_KEY);

  return {
    cancelSubscription: (id) => stripe.subscriptions.cancel(id),
    deleteCustomer: (id) => stripe.customers.del(id),
    deleteMedia: async ({ memberId, galleryRefs, companyIds }) => {
      await deleteAvatar(memberId);
      for (const ref of galleryRefs) {
        await deleteCompanyImage(ref.companyId, ref.imageId);
      }
      for (const companyId of companyIds) {
        await deleteCompanyLogo(companyId);
      }
    },
  };
}
