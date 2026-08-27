import { and, count, desc, eq, isNull, lt } from "drizzle-orm";

import type { DbClient } from "./db";
import { notifications } from "./schema/notifications";

/**
 * The member's in-product inbox (FR-099, ADR 0020).
 *
 * Every read here is scoped by `memberId` taken from the session, never from
 * anything the caller supplied: an inbox that could be addressed by id would be
 * a way to learn about another member, which ADR 0005 forbids outright.
 */

export type NotificationKind = (typeof notifications.$inferSelect)["kind"];

export type NotificationRow = typeof notifications.$inferSelect;

/** How long a notification is kept (data-storage.md §4). */
export const NOTIFICATION_RETENTION_DAYS = 180;

/** The inbox never paginates past this; older rows are history, not an inbox. */
export const NOTIFICATION_PAGE_SIZE = 50;

export interface NewNotification {
  memberId: string;
  kind: NotificationKind;
  /** Ids, names and integer amounts only - never a rendered sentence (FR-090). */
  params?: Record<string, unknown>;
  /**
   * Set for anything written outside a user's own request, so a redelivered
   * webhook or a re-run sweep cannot produce a second row. Enforced by a unique
   * index rather than by checking first.
   */
  dedupeKey?: string;
}

/**
 * Write one notification.
 *
 * A duplicate `dedupeKey` is not an error: it means the event this describes has
 * already been recorded, which is exactly what the key is for. The insert is
 * skipped and the caller carries on.
 */
export async function createNotification(
  db: DbClient,
  notification: NewNotification,
): Promise<void> {
  await db
    .insert(notifications)
    .values({
      memberId: notification.memberId,
      kind: notification.kind,
      params: notification.params ?? {},
      dedupeKey: notification.dedupeKey ?? null,
    })
    .onConflictDoNothing();
}

export async function listNotificationsForMember(
  db: DbClient,
  memberId: string,
  limit = NOTIFICATION_PAGE_SIZE,
): Promise<NotificationRow[]> {
  return db.query.notifications.findMany({
    where: eq(notifications.memberId, memberId),
    orderBy: [desc(notifications.createdAt)],
    limit,
  });
}

/** Backs the header badge, so it runs on every dashboard render. */
export async function countUnreadForMember(
  db: DbClient,
  memberId: string,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(
      and(eq(notifications.memberId, memberId), isNull(notifications.readAt)),
    );

  return row?.value ?? 0;
}

/**
 * Mark one notification read.
 *
 * The member id is part of the WHERE rather than checked beforehand, so a
 * guessed notification id belonging to someone else matches nothing instead of
 * confirming that it exists.
 */
export async function markNotificationRead(
  db: DbClient,
  memberId: string,
  notificationId: string,
  now: Date,
): Promise<boolean> {
  const changed = await db
    .update(notifications)
    .set({ readAt: now, updatedAt: now })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.memberId, memberId),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id });

  return changed.length > 0;
}

export async function markAllNotificationsRead(
  db: DbClient,
  memberId: string,
  now: Date,
): Promise<number> {
  const changed = await db
    .update(notifications)
    .set({ readAt: now, updatedAt: now })
    .where(
      and(eq(notifications.memberId, memberId), isNull(notifications.readAt)),
    )
    .returning({ id: notifications.id });

  return changed.length;
}

/**
 * Retention sweep (data-storage.md §4). Read or unread alike: an inbox is a
 * record of recent events, and a notification nobody opened in six months is
 * not one the member is still waiting for.
 */
export async function deleteExpiredNotifications(
  db: DbClient,
  now: Date,
  days = NOTIFICATION_RETENTION_DAYS,
): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const deleted = await db
    .delete(notifications)
    .where(lt(notifications.createdAt, cutoff))
    .returning({ id: notifications.id });

  return deleted.length;
}

/**
 * Everything a member holds, read or unread.
 *
 * Erasure itself deletes the rows inside `eraseMemberTx`'s own transaction
 * rather than through a function here, because a half-erased member is worse
 * than an un-erased one. This is what its test asserts against.
 */
export async function countNotificationsForMember(
  db: DbClient,
  memberId: string,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(eq(notifications.memberId, memberId));

  return row?.value ?? 0;
}
