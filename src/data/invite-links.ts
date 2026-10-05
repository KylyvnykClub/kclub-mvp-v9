import { and, count, eq, isNull, sql } from "drizzle-orm";

import type { Db, DbClient } from "./db";
import { listMemberSubscriptionPlans } from "./billing";
import { memberOwnsPaidListing } from "./companies";
import { loadMembershipAccess } from "./membership-access";
import {
  invitations,
  inviteLinks,
  members,
  type InviteLinkKind,
} from "./schema";
import { inviterStanding, type InviterStanding } from "@/domain/invites";

/**
 * A member's personal invite links and the invitations they produced
 * (ADR 0042). One live link of each kind per member, enforced by the partial
 * unique index; one invitation per invitee, enforced by its primary key.
 */
export type InviteLinkRow = typeof inviteLinks.$inferSelect;
export type InvitationRow = typeof invitations.$inferSelect;

export async function listActiveInviteLinks(
  db: DbClient,
  ownerMemberId: string,
): Promise<InviteLinkRow[]> {
  return db.query.inviteLinks.findMany({
    where: and(
      eq(inviteLinks.ownerMemberId, ownerMemberId),
      eq(inviteLinks.active, true),
    ),
  });
}

/**
 * Hangs a link of this kind if the member has none. Two tabs opening the
 * cabinet at once race on the partial unique index, and the loser's insert
 * does nothing rather than failing.
 */
export async function ensureInviteLink(
  db: DbClient,
  ownerMemberId: string,
  kind: InviteLinkKind,
  code: string,
): Promise<void> {
  await db
    .insert(inviteLinks)
    .values({ ownerMemberId, kind, code })
    .onConflictDoNothing();
}

/** Retires the member's live link of this kind and hangs a new one. */
export async function rotateInviteLink(
  db: Db,
  ownerMemberId: string,
  kind: InviteLinkKind,
  code: string,
  now: Date,
): Promise<InviteLinkRow> {
  return db.transaction(async (tx) => {
    // Serialises two rotations by one member (a double click): without it
    // the second insert meets the partial unique index and fails.
    await tx.execute(
      sql`SELECT 1 FROM ${members} WHERE ${members.id} = ${ownerMemberId} FOR UPDATE`,
    );
    await tx
      .update(inviteLinks)
      .set({ active: false, revokedAt: now })
      .where(
        and(
          eq(inviteLinks.ownerMemberId, ownerMemberId),
          eq(inviteLinks.kind, kind),
          eq(inviteLinks.active, true),
        ),
      );

    const [row] = await tx
      .insert(inviteLinks)
      .values({ ownerMemberId, kind, code })
      .returning();

    return row!;
  });
}

export async function findActiveInviteLinkByCode(
  db: DbClient,
  code: string,
): Promise<InviteLinkRow | null> {
  const row = await db.query.inviteLinks.findFirst({
    where: and(
      eq(inviteLinks.code, code),
      eq(inviteLinks.active, true),
      isNull(inviteLinks.revokedAt),
    ),
  });
  return row ?? null;
}

/** Read again at submit time: rotating has to mean rotated now. */
export async function findActiveInviteLinkById(
  db: DbClient,
  id: string,
): Promise<InviteLinkRow | null> {
  const row = await db.query.inviteLinks.findFirst({
    where: and(
      eq(inviteLinks.id, id),
      eq(inviteLinks.active, true),
      isNull(inviteLinks.revokedAt),
    ),
  });
  return row ?? null;
}

/**
 * The member's standing for the invite matrix, now - or null when their link
 * must do nothing. Blocked, erased and unpaid members have no standing.
 */
export async function loadInviterStanding(
  db: DbClient,
  memberId: string,
  now: Date,
): Promise<InviterStanding | null> {
  const member = await db.query.members.findFirst({
    where: eq(members.id, memberId),
    columns: { id: true, duesKind: true, status: true, deletedAt: true },
  });
  if (!member || member.status !== "active" || member.deletedAt) return null;

  const [access, ownsPaidListing, subscriptions] = await Promise.all([
    loadMembershipAccess(db, member, now),
    memberOwnsPaidListing(db, member.id, now),
    listMemberSubscriptionPlans(db, member.id),
  ]);

  return inviterStanding({
    inClub: access === "active",
    ownsPaidListing,
    subscriptions,
  });
}

/**
 * Records who brought this invitee, once. The primary key on the invitee
 * makes a second attribution a no-op rather than a second row.
 */
export async function recordInvitation(
  db: DbClient,
  invitation: Omit<InvitationRow, "createdAt" | "waiverUsedAt">,
): Promise<void> {
  await db.insert(invitations).values(invitation).onConflictDoNothing();
}

export async function findInvitationOf(
  db: DbClient,
  inviteeMemberId: string,
): Promise<InvitationRow | null> {
  const row = await db.query.invitations.findFirst({
    where: eq(invitations.inviteeMemberId, inviteeMemberId),
  });
  return row ?? null;
}

/**
 * How many people this member has brought, by kind (FR-125). Counts only:
 * no member-scoped caller may learn who they are (ADR 0005).
 */
export async function countInvitationsByInviter(
  db: DbClient,
  inviterMemberId: string,
): Promise<Record<InviteLinkKind, number>> {
  const rows = await db
    .select({ kind: invitations.kind, total: count() })
    .from(invitations)
    .where(eq(invitations.inviterMemberId, inviterMemberId))
    .groupBy(invitations.kind);

  const counts: Record<InviteLinkKind, number> = { member: 0, partner: 0 };
  for (const row of rows) counts[row.kind] = Number(row.total);
  return counts;
}

/**
 * Spends the listing waiver of this member's partner invitation, if there is
 * one left. Returns the link it came through (null if that link has since
 * been deleted), or `false` when there was nothing to spend. Conditional in
 * the UPDATE, so two applications filed at once cannot both take it.
 */
export async function spendInviteListingWaiver(
  db: DbClient,
  inviteeMemberId: string,
  now: Date,
): Promise<{ inviteLinkId: string | null } | false> {
  const [row] = await db
    .update(invitations)
    .set({ waiverUsedAt: now })
    .where(
      and(
        eq(invitations.inviteeMemberId, inviteeMemberId),
        eq(invitations.kind, "partner"),
        eq(invitations.waived, true),
        isNull(invitations.waiverUsedAt),
      ),
    )
    .returning({ inviteLinkId: invitations.inviteLinkId });
  return row ?? false;
}

export type MemberInviteSummary = {
  /** Who brought this member, if anyone. Staff only (FR-126). */
  invitedBy: {
    inviterMemberId: string | null;
    inviterDisplayName: string | null;
    kind: InviteLinkKind;
    inviterStanding: InviterStanding;
    waived: boolean;
    createdAt: Date;
  } | null;
  /** How many people this member has brought, by kind. */
  brought: Record<InviteLinkKind, number>;
};

/**
 * The console's view of one member's place in the invite programme (FR-126).
 * Names the inviter, so it is called from staff-scoped code only; the
 * member-scoped view is `countInvitationsByInviter`.
 */
export async function loadMemberInviteSummary(
  db: DbClient,
  memberId: string,
): Promise<MemberInviteSummary> {
  const [invitation, brought] = await Promise.all([
    db
      .select({
        inviterMemberId: invitations.inviterMemberId,
        inviterDisplayName: members.displayName,
        kind: invitations.kind,
        inviterStanding: invitations.inviterStanding,
        waived: invitations.waived,
        createdAt: invitations.createdAt,
      })
      .from(invitations)
      .leftJoin(members, eq(members.id, invitations.inviterMemberId))
      .where(eq(invitations.inviteeMemberId, memberId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    countInvitationsByInviter(db, memberId),
  ]);

  return { invitedBy: invitation, brought };
}
