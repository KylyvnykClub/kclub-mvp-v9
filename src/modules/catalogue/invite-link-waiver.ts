import { appendAuditEntry } from "@/data/audit-log";
import { waiveListingByInvite } from "@/data/companies";
import type { Db } from "@/data/db";
import { spendInviteListingWaiver } from "@/data/invite-links";
import { logger } from "@/lib/logger";

/**
 * ADR 0042, FR-124: if this owner was brought in through a member's partner
 * invite link, waive the listing of the application just filed - once per
 * invitation. Read from the invitation recorded at registration, not from a
 * cookie, so it holds on the dashboard form and on a retry alike.
 *
 * The waiver belongs to the first application filed after the invitation and
 * is spent on it whatever happens - if the club's partner link already waived
 * that listing, the invitation does not carry over to a second one. The spent
 * mark, the waiver and the audit entry are one transaction. A failure never
 * fails the application; it is logged, and the company waits for payment.
 */
export async function applyInviteLinkWaiver(
  db: Db,
  ownerId: string,
  companyId: string,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const now = new Date();
      const spent = await spendInviteListingWaiver(tx, ownerId, now);
      if (!spent) return;

      const waived = await waiveListingByInvite(
        tx,
        companyId,
        ownerId,
        spent.inviteLinkId,
        now,
      );
      if (!waived) return;

      await appendAuditEntry(tx, {
        actorType: "member",
        actorId: ownerId,
        action: "company.listing_waived",
        subjectType: "company",
        subjectId: companyId,
        meta: { by: "invite", inviteLinkId: spent.inviteLinkId },
      });
    });
  } catch (error) {
    logger.error("Could not apply the invite link waiver", {
      companyId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
