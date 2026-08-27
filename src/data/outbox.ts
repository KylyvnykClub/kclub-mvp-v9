import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";

import type { DbClient } from "./db";
import { outbox } from "./schema/outbox";

export type OutboxEntry = typeof outbox.$inferSelect;

/**
 * Outbox topic for billing-related notifications, and the payload `type`
 * discriminators carried inside it.
 *
 * These live beside the table rather than in the billing module because
 * `findSubscriptionsNearingGraceExpiry` (data/billing.ts) reads them to
 * deduplicate against rows already enqueued, and importing them from
 * `@/modules/billing/projection` would close the cycle
 * data/billing -> modules/billing/projection -> data/billing.
 */
export const BILLING_NOTIFICATION_TOPIC = "billing.notification";
export const PAYMENT_FAILED_NOTIFICATION = "payment_failed";
export const GRACE_EXPIRY_WARNING_NOTIFICATION = "grace_expiry_warning";

/**
 * Retry for the cancel-and-refund a rejection owes a paid company (ADR 0019).
 *
 * A moderator's decision must never be blocked by Stripe being unreachable, so
 * the rejection commits first and the money is undone afterwards. When that
 * fails, a row on this topic carries it to the next drain. Payload:
 * `{ companyId }` - the refund re-derives the subscription, because by then the
 * one it saw may have changed.
 */
export const BILLING_REFUND_RETRY_TOPIC = "billing.refund.retry";

export async function enqueueOutbox(
  db: DbClient,
  topic: string,
  payload: unknown,
): Promise<void> {
  await db.insert(outbox).values({ topic, payload });
}

export async function drainOutbox(
  db: DbClient,
  batchSize: number,
): Promise<OutboxEntry[]> {
  const rows = await db.execute(sql`
    SELECT id, created_at, topic, payload, processed_at
    FROM outbox
    WHERE processed_at IS NULL
    ORDER BY created_at
    LIMIT ${batchSize}
    FOR UPDATE SKIP LOCKED
  `);

  return rows.rows as OutboxEntry[];
}

/**
 * Take one specific pending row and hold its lock for the caller's
 * transaction. Returns undefined when another drain already has it, or when it
 * was processed between being listed and being claimed - `drainOutbox` only
 * produces candidates, and this is where a row is actually taken.
 */
export async function claimOutboxRow(
  db: DbClient,
  id: string,
): Promise<OutboxEntry | undefined> {
  const rows = await db.execute(sql`
    SELECT id, created_at, topic, payload, processed_at
    FROM outbox
    WHERE id = ${id} AND processed_at IS NULL
    FOR UPDATE SKIP LOCKED
  `);

  return (rows.rows as OutboxEntry[])[0];
}

export async function markProcessed(db: DbClient, id: string): Promise<void> {
  await db
    .update(outbox)
    .set({ processedAt: new Date() })
    .where(eq(outbox.id, id));
}

export async function countPending(db: DbClient): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(outbox)
    .where(isNull(outbox.processedAt));

  return Number(result[0]?.count ?? 0);
}

/**
 * How long a processed outbox row is kept before the retention sweep removes
 * it. Comfortably longer than the grace-plus-dunning window a billing-period
 * warning is deduplicated over (data/billing.ts), so pruning never lets a
 * duplicate FR-056 notification through.
 */
export const OUTBOX_RETENTION_DAYS = 90;

/**
 * Hard-delete outbox rows that were processed longer ago than the retention
 * period, so the table does not grow without bound. Pending rows (a stuck
 * notification, say) are never touched, whatever their age - a row that still
 * needs delivering must not be swept away before it is sent. Returns how many
 * were removed so the cron can report it.
 */
export async function deleteProcessedOutboxRows(
  db: DbClient,
  now: Date,
  retentionDays: number = OUTBOX_RETENTION_DAYS,
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

  const removed = await db
    .delete(outbox)
    .where(and(isNotNull(outbox.processedAt), lt(outbox.processedAt, cutoff)))
    .returning({ id: outbox.id });

  return removed.length;
}
