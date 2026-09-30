import { and, desc, eq, isNull } from "drizzle-orm";

import type { Db, DbClient } from "./db";
import { joinLinks, type JoinLinkKind } from "./schema";

/**
 * The club's join links (ADR 0033, ADR 0040): one for members, one for
 * business partners. One live row of each kind at a time, enforced by the
 * partial unique index rather than by whoever remembers.
 */
export type JoinLinkRow = typeof joinLinks.$inferSelect;

export async function findActiveJoinLink(
  db: DbClient,
  kind: JoinLinkKind,
): Promise<JoinLinkRow | null> {
  const row = await db.query.joinLinks.findFirst({
    where: and(eq(joinLinks.active, true), eq(joinLinks.kind, kind)),
    orderBy: [desc(joinLinks.createdAt)],
  });

  return row ?? null;
}

/**
 * The active link with this exact secret, or null.
 *
 * Revoked links are not matched: revoking is the answer to a leak, so a secret
 * that has been revoked must stop admitting people the moment it is.
 */
export async function findActiveJoinLinkBySecret(
  db: DbClient,
  secret: string,
): Promise<JoinLinkRow | null> {
  const row = await db.query.joinLinks.findFirst({
    where: and(
      eq(joinLinks.secret, secret),
      eq(joinLinks.active, true),
      isNull(joinLinks.revokedAt),
    ),
  });

  return row ?? null;
}

/**
 * The link with this id, if it is still open.
 *
 * Read at submit time as well as when the link is opened: the seal proves the
 * door was open half an hour ago, and revoking has to mean revoked now.
 */
export async function findActiveJoinLinkById(
  db: DbClient,
  id: string,
): Promise<JoinLinkRow | null> {
  const row = await db.query.joinLinks.findFirst({
    where: and(
      eq(joinLinks.id, id),
      eq(joinLinks.active, true),
      isNull(joinLinks.revokedAt),
    ),
  });

  return row ?? null;
}

/**
 * Revoke whatever door is open and hang a new one, in a single transaction —
 * so there is never a moment with two live links or with none.
 */
export async function rotateJoinLink(
  db: Db,
  kind: JoinLinkKind,
  secret: string,
  createdBy: string | null,
): Promise<JoinLinkRow> {
  return db.transaction(async (tx) => {
    await tx
      .update(joinLinks)
      .set({ active: false, revokedAt: new Date() })
      .where(and(eq(joinLinks.active, true), eq(joinLinks.kind, kind)));

    const [row] = await tx
      .insert(joinLinks)
      .values({ kind, secret, createdBy })
      .returning();

    return row!;
  });
}

/** Closes the door of this kind and opens none. */
export async function revokeActiveJoinLink(
  db: Db,
  kind: JoinLinkKind,
): Promise<boolean> {
  const rows = await db
    .update(joinLinks)
    .set({ active: false, revokedAt: new Date() })
    .where(and(eq(joinLinks.active, true), eq(joinLinks.kind, kind)))
    .returning({ id: joinLinks.id });

  return rows.length > 0;
}
