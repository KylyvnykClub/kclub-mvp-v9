import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import type { DbClient } from "@/data/db.js";
import {
  OUTBOX_ERROR_MAX_LENGTH,
  enqueueOutbox,
  findOldestPendingOutboxAt,
  recordOutboxFailure,
} from "@/data/outbox.js";
import { outbox } from "@/data/schema/index.js";
import {
  CRON_BATCH_SIZE,
  runOutboxDrain,
} from "@/modules/platform/outbox-worker.js";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * FR-052: entitlements are derived from Stripe webhook state, and that
 * derivation runs through the outbox. On 2026-08-27 one projection row failed
 * and stayed pending for hours - a member had paid and held a free card - and
 * nothing recorded that it had ever been tried. A row that fails every time
 * looked exactly like one the drain had not reached yet, so the only thing
 * that surfaced it was the member noticing.
 *
 * These cover the bookkeeping that makes the difference visible, and the one
 * property that matters most: it must survive the transaction whose failure it
 * is recording.
 */

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

async function readRow(db: DbClient, id: string) {
  const [row] = await db.select().from(outbox).where(eq(outbox.id, id));
  return row!;
}

async function insertPending(
  db: DbClient,
  topic: string,
  payload: unknown,
  createdAt: Date = new Date(),
): Promise<string> {
  const [row] = await db
    .insert(outbox)
    .values({ topic, payload, createdAt })
    .returning({ id: outbox.id });
  return row!.id;
}

describe("FR-052: a failing outbox row records that it failed", () => {
  it("starts at zero attempts with no error", async () => {
    const db = testDbClient();
    const id = await insertPending(db, "test.topic", { type: "test" });

    const row = await readRow(db, id);
    expect(row.attempts).toBe(0);
    expect(row.lastError).toBeNull();
  });

  it("counts each failure and keeps the most recent message", async () => {
    const db = testDbClient();
    const id = await insertPending(db, "test.topic", { type: "test" });

    await recordOutboxFailure(db, id, "Stripe is unreachable");
    expect((await readRow(db, id)).attempts).toBe(1);

    await recordOutboxFailure(db, id, "connection terminated");
    const row = await readRow(db, id);
    expect(row.attempts).toBe(2);
    expect(row.lastError).toBe("connection terminated");
  });

  it("truncates a message long enough to be a leak rather than a diagnosis", async () => {
    const db = testDbClient();
    const id = await insertPending(db, "test.topic", { type: "test" });

    await recordOutboxFailure(
      db,
      id,
      "x".repeat(OUTBOX_ERROR_MAX_LENGTH + 500),
    );

    expect((await readRow(db, id)).lastError).toHaveLength(
      OUTBOX_ERROR_MAX_LENGTH,
    );
  });

  it("records the failure of a row whose own transaction rolled back", async () => {
    const db = testDbClient();

    // A projection row whose Stripe read fails. handleEntry throws, the row's
    // transaction rolls back, and processed_at stays null for the retry. The
    // bookkeeping has to land anyway - written inside that transaction it
    // would have rolled back with it, which is the whole point.
    const id = await insertPending(db, "billing.subscription.sync", {
      subscriptionId: "sub_never_resolves",
      eventCreated: Math.floor(Date.now() / 1000),
    });

    const result = await runOutboxDrain(CRON_BATCH_SIZE, {
      db: getTestDb() as never,
      fetchSubscription: () => Promise.reject(new Error("Stripe is down")),
    });

    expect(result.failed).toBeGreaterThanOrEqual(1);

    const row = await readRow(db, id);
    expect(row.processedAt).toBeNull();
    expect(row.attempts).toBe(1);
    expect(row.lastError).toBe("Stripe is down");
  });
});

describe("FR-052: the age of the oldest waiting row is readable", () => {
  it("reports nothing pending when every row is processed", async () => {
    const db = testDbClient();
    await db.delete(outbox);

    const id = await insertPending(db, "test.topic", { type: "test" });
    await db
      .update(outbox)
      .set({ processedAt: new Date() })
      .where(eq(outbox.id, id));

    expect(await findOldestPendingOutboxAt(db)).toBeNull();
  });

  it("returns the oldest pending row, not the newest and not a processed one", async () => {
    const db = testDbClient();
    await db.delete(outbox);

    const old = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const recent = new Date(Date.now() - 60 * 1000);

    await insertPending(db, "test.topic", { type: "old" }, old);
    await insertPending(db, "test.topic", { type: "recent" }, recent);

    const oldest = await findOldestPendingOutboxAt(db);
    expect(oldest?.toISOString()).toBe(old.toISOString());
  });
});

describe("enqueueOutbox", () => {
  it("writes a row that is pending and unattempted", async () => {
    const db = testDbClient();
    await db.delete(outbox);

    await enqueueOutbox(db, "test.topic", { type: "fresh" });

    const [row] = await db.select().from(outbox);
    expect(row!.processedAt).toBeNull();
    expect(row!.attempts).toBe(0);
  });
});
