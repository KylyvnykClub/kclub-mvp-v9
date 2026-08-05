import { eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { outbox } from "./schema/outbox";

export type OutboxEntry = typeof outbox.$inferSelect;

export async function enqueueOutbox(
  db: NodePgDatabase,
  topic: string,
  payload: unknown,
): Promise<void> {
  await db.insert(outbox).values({ topic, payload });
}

export async function drainOutbox(
  db: NodePgDatabase,
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

export async function markProcessed(
  db: NodePgDatabase,
  id: string,
): Promise<void> {
  await db
    .update(outbox)
    .set({ processedAt: new Date() })
    .where(eq(outbox.id, id));
}

export async function countPending(db: NodePgDatabase): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(outbox)
    .where(isNull(outbox.processedAt));

  return Number(result[0]?.count ?? 0);
}
