import { and, eq, isNull, lt, sql } from "drizzle-orm";

import type { DbClient } from "./db";
import {
  accountDeletionRequests,
  cards,
  companies,
  companyImages,
  members,
  notifications,
  referrals,
  sessions,
} from "./schema";

/**
 * The erasure that closes a deletion request (FR-009, data-storage.md §4).
 *
 * The member row is anonymised rather than deleted: payment records and audit
 * entries hold a foreign key to it, and losing them to satisfy an erasure would
 * break the tax record-keeping the Privacy Policy names as an exception. What
 * survives - internal id, country, registration month, subscription linkage -
 * is enough for revenue reporting and insufficient to identify a person.
 */

/** Days between the request and the erasure (data-storage.md §4). */
export const ACCOUNT_ERASURE_DAYS = 30;

/** What replaces a display name once the person behind it is gone. */
export const ERASED_DISPLAY_NAME = "Deleted member";

/**
 * What replaces the phone number.
 *
 * `members.phone` is `varchar(20)` and unique, so the placeholder has to be
 * short and collision-free. Sixteen hex characters of the member id give 64
 * bits, and deriving it from the id keeps the erasure idempotent: running it
 * twice writes the same value rather than a second one.
 */
export function erasedPhone(memberId: string): string {
  return `del:${memberId.replace(/-/g, "").slice(0, 16)}`;
}

export function accountErasureCutoff(
  now: Date,
  days = ACCOUNT_ERASURE_DAYS,
): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Members whose 30 days have elapsed and who have not yet been erased.
 *
 * Ordered oldest first so a backlog is worked in the order the requests were
 * made, and so a partial run makes progress rather than retrying the same rows.
 */
export async function findMembersDueForErasure(
  db: DbClient,
  now: Date,
  days = ACCOUNT_ERASURE_DAYS,
): Promise<{ memberId: string; requestedAt: Date }[]> {
  const rows = await db
    .select({
      memberId: accountDeletionRequests.memberId,
      requestedAt: accountDeletionRequests.requestedAt,
    })
    .from(accountDeletionRequests)
    .innerJoin(members, eq(members.id, accountDeletionRequests.memberId))
    .where(
      and(
        lt(
          accountDeletionRequests.requestedAt,
          accountErasureCutoff(now, days),
        ),
        isNull(members.deletedAt),
      ),
    )
    .orderBy(accountDeletionRequests.requestedAt);

  return rows;
}

/**
 * Erase one member.
 *
 * Everything here is inside one transaction: a half-erased member is worse
 * than an un-erased one, because nothing would tell the next run which half
 * still needed doing.
 *
 * Deliberately NOT done here: deleting the Stripe Customer and cancelling any
 * active subscriptions - which is what actually unpublishes a live company
 * listing, since catalogue visibility is projected from subscription status,
 * not a flag on the company - is an external call, handled by
 * `eraseStripeCustomerForMember` (src/modules/billing/erasure.ts) before this
 * runs. Deleting the member's R2 avatar object is also an external call,
 * handled the same way by the caller (src/app/api/cron/retention/route.ts),
 * best-effort, after this transaction commits (ADR 0021). Company images
 * remain untouched: partner logos are still external URLs, not R2 uploads
 * (ADR 0013).
 *
 * There is still no notification *delivery log* to clear (ADR 0014), but since
 * ADR 0020 there is an in-product inbox, and it is deleted here explicitly.
 * The `ON DELETE CASCADE` on `notifications.member_id` is no help: this
 * procedure anonymises the member row rather than deleting it, so the cascade
 * never fires and the notifications would outlive the person they describe.
 */
export async function eraseMemberTx(
  db: DbClient,
  memberId: string,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    // The phone is the login identifier and is unique, so it cannot simply be
    // blanked; it is replaced with a value that identifies nobody and still
    // satisfies the constraint.
    await tx
      .update(members)
      .set({
        phone: erasedPhone(memberId),
        passwordHash: "",
        displayName: ERASED_DISPLAY_NAME,
        totpSecret: null,
        totpEnabled: false,
        canSendReferrals: false,
        deletedAt: now,
      })
      .where(eq(members.id, memberId));

    await tx.delete(sessions).where(eq(sessions.memberId, memberId));

    // The QR token cannot be withdrawn from whoever holds a printed card, so
    // it is overwritten and the card revoked - the verification page then
    // reports it as revoked rather than resolving to a person.
    await tx
      .update(cards)
      .set({
        status: "revoked",
        token: sql`concat('erased:', ${cards.id}::text)`,
        tokenHash: null,
      })
      .where(eq(cards.memberId, memberId));

    // Client contact details this member submitted are not theirs to keep and
    // are not ours either (ADR 0009). The referral shell stays.
    await tx
      .update(referrals)
      .set({
        clientName: ERASED_DISPLAY_NAME,
        contactChannel: null,
        note: null,
      })
      .where(eq(referrals.senderId, memberId));

    // The inbox describes things that happened to this person and names their
    // companies; none of it survives them (ADR 0020).
    await tx.delete(notifications).where(eq(notifications.memberId, memberId));

    // Gallery rows for owned companies (ADR 0022). Companies are anonymised
    // above rather than deleted, so the ON DELETE CASCADE on
    // company_images.company_id never fires - same trap as notifications.
    // The caller collects the R2 keys before this transaction and deletes
    // the objects best-effort afterwards.
    await tx.delete(companyImages).where(
      sql`${companyImages.companyId} in (
        select ${companies.id} from ${companies}
        where ${companies.ownerId} = ${memberId}
      )`,
    );
  });
}
