import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import type { DbClient } from "@/data/db.js";
import {
  OUTBOX_RETENTION_DAYS,
  deleteProcessedOutboxRows,
} from "@/data/outbox.js";
import { outbox } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * Backlog outbox-has-no-retention-and-no-payload-index: the outbox table was
 * never pruned. The retention sweep removes processed history past the window,
 * but must never touch a row still waiting to be delivered - a stuck
 * notification (the kind the daily drain is meant to catch) has to survive,
 * whatever its age.
 *
 * Running under the integration setup also exercises the migration that adds
 * the two outbox indexes: if its SQL were wrong the container would fail to
 * apply it and this whole file would never start.
 */

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function insertRow(
  db: DbClient,
  topic: string,
  processedAt: Date | null,
  createdAt: Date = new Date(),
): Promise<string> {
  const [row] = await db
    .insert(outbox)
    .values({ topic, payload: { type: "test" }, processedAt, createdAt })
    .returning({ id: outbox.id });
  return row!.id;
}

async function exists(db: DbClient, id: string): Promise<boolean> {
  const rows = await db
    .select({ id: outbox.id })
    .from(outbox)
    .where(eq(outbox.id, id));
  return rows.length > 0;
}

describe("outbox retention sweep", () => {
  it("removes a processed row older than the retention window", async () => {
    const db = testDbClient();
    const id = await insertRow(
      db,
      `ret-old-${crypto.randomUUID()}`,
      daysAgo(OUTBOX_RETENTION_DAYS + 1),
    );

    const deleted = await deleteProcessedOutboxRows(db, new Date());

    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await exists(db, id)).toBe(false);
  });

  it("keeps a processed row still inside the retention window", async () => {
    const db = testDbClient();
    const id = await insertRow(
      db,
      `ret-recent-${crypto.randomUUID()}`,
      daysAgo(OUTBOX_RETENTION_DAYS - 1),
    );

    await deleteProcessedOutboxRows(db, new Date());

    expect(await exists(db, id)).toBe(true);
  });

  it("never deletes a pending row, however old - a stuck notification must survive", async () => {
    const db = testDbClient();
    const id = await insertRow(
      db,
      `ret-pending-${crypto.randomUUID()}`,
      null,
      daysAgo(OUTBOX_RETENTION_DAYS + 100),
    );

    await deleteProcessedOutboxRows(db, new Date());

    expect(await exists(db, id)).toBe(true);
  });
});
