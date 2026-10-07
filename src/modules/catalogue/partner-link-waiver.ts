import { cookies } from "next/headers";

import { appendAuditEntry } from "@/data/audit-log";
import { waiveListingByPartnerLink } from "@/data/companies";
import { findActiveJoinLinkById } from "@/data/join-links";
import type { Db, DbClient } from "@/data/db";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { openPendingJoin, PENDING_JOIN_COOKIE } from "@/lib/pending-join";

/**
 * ADR 0040: if this browser came through the owner's partner link, waive the
 * listing of the application just filed. Called by every path that files an
 * application - the partner page and the dashboard form - so a member who is
 * already in the club and follows the link keeps the free listing too.
 *
 * The waiver and its audit entry are one transaction. A failure here never
 * fails the application: the company exists, and a moderator can see it
 * waiting for payment. It is logged instead, and the cookie is kept so the
 * link is not lost. The cookie is spent only once the waiver is written, or
 * once the link has proved to be no partner link at all.
 */
export async function applyPartnerLinkWaiver(
  db: Db,
  ownerId: string,
  companyId: string,
): Promise<void> {
  const cookieStore = await cookies();
  const pending = openPendingJoin(
    cookieStore.get(PENDING_JOIN_COOKIE)?.value,
    env.server.BETTER_AUTH_SECRET,
  );
  if (!pending) return;

  try {
    await db.transaction(async (tx) => {
      const done = await waiveListingByPartnerLink(
        tx,
        companyId,
        pending.joinLinkId,
        new Date(),
      );
      if (done) {
        await appendAuditEntry(tx, {
          actorType: "member",
          actorId: ownerId,
          action: "company.listing_waived",
          subjectType: "company",
          subjectId: companyId,
          meta: { joinLinkId: pending.joinLinkId },
        });
      }
    });

    // Waived, or the link is revoked or is a member link: either way this
    // cookie has nothing more to give the next application from this browser.
    cookieStore.set(PENDING_JOIN_COOKIE, "", { path: "/", maxAge: 0 });
  } catch (error) {
    logger.error("Could not apply the partner link waiver", {
      companyId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Whether this browser carries the club's partner link, still active - the
 * question the application form asks before anything is filed, so it can say
 * "free" instead of asking for a card (ADR 0040, ADR 0044). The waiver itself
 * is still written by `applyPartnerLinkWaiver`, which checks the link again.
 */
export async function clubPartnerLinkPending(db: DbClient): Promise<boolean> {
  const cookieStore = await cookies();
  const pending = openPendingJoin(
    cookieStore.get(PENDING_JOIN_COOKIE)?.value,
    env.server.BETTER_AUTH_SECRET,
  );
  if (!pending) return false;
  const link = await findActiveJoinLinkById(db, pending.joinLinkId);
  return link?.kind === "partner";
}
