import { and, desc, eq, isNull } from "drizzle-orm";

import type { Db, DbClient } from "./db";
import { joinLinks } from "./schema";

/**
 * The club's join link (ADR 0033). One live row at a time, enforced by the
 * partial unique index rather than by whoever remembers.
 */
export type JoinLinkRow = typeof joinLinks.$inferSelect;

export async function findActiveJoinLink(
  db: DbClient,
): Promise<JoinLinkRow | null> {
  const row = await db.query.joinLinks.findFirst({
    where: eq(joinLinks.active, true),
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
  secret: string,
  createdBy: string | null,
): Promise<JoinLinkRow> {
  return db.transaction(async (tx) => {
    await tx
      .update(joinLinks)
      .set({ active: false, revokedAt: new Date() })
      .where(eq(joinLinks.active, true));

    const [row] = await tx
      .insert(joinLinks)
      .values({ secret, createdBy })
      .returning();

    return row!;
  });
}

/** Closes the door and opens none. Registration then charges everybody. */
export async function revokeActiveJoinLink(db: Db): Promise<boolean> {
  const rows = await db
    .update(joinLinks)
    .set({ active: false, revokedAt: new Date() })
    .where(eq(joinLinks.active, true))
    .returning({ id: joinLinks.id });

  return rows.length > 0;
}
