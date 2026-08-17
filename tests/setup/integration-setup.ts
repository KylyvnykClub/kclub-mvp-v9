import { beforeEach, afterEach } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/data/schema/index.js";

type TestDb = NodePgDatabase<typeof schema>;
type TestTx = Parameters<Parameters<TestDb["transaction"]>[0]>[0];

/**
 * Thrown at the end of the held-open outer transaction's callback to force
 * drizzle's node-postgres session into its ROLLBACK branch instead of COMMIT.
 * Never leaks past afterEach - it is caught and swallowed there.
 */
class TestTransactionRollback extends Error {
  constructor() {
    super("integration-setup: intentional rollback, not a real failure");
    this.name = "TestTransactionRollback";
  }
}

let client: pg.Client | undefined;
let currentTx: TestTx | undefined;
let outerTxPromise: Promise<void> | undefined;
let releaseHold: (() => void) | undefined;

beforeEach(async () => {
  const connectionString = process.env["TEST_DATABASE_URL"];
  if (!connectionString) {
    throw new Error("TEST_DATABASE_URL is not set. Did the globalSetup run?");
  }

  client = new pg.Client({ connectionString });
  await client.connect();

  const db = drizzle(client, { schema });

  let resolveStarted!: (tx: TestTx) => void;
  const started = new Promise<TestTx>((resolve) => {
    resolveStarted = resolve;
  });

  let resolveHold!: () => void;
  const held = new Promise<void>((resolve) => {
    resolveHold = resolve;
  });
  releaseHold = resolveHold;

  // Start the outer transaction and keep it open for the lifetime of the
  // test. Nesting application code's own db.transaction() calls inside this
  // tx dispatches to drizzle's savepoint-aware NodePgTransaction.transaction()
  // instead of the raw-BEGIN/COMMIT NodePgSession.transaction() - which is
  // what makes nested transactions correctly isolated instead of silently
  // committing the outer test transaction. See docs/testing.md §5.
  outerTxPromise = db
    .transaction(async (tx) => {
      resolveStarted(tx);
      await held;
      // Always throw so drizzle's session code issues a real ROLLBACK, never
      // a COMMIT - the outer transaction must never commit.
      throw new TestTransactionRollback();
    })
    .then(
      () => {
        throw new Error(
          "integration-setup: outer transaction resolved instead of rolling back",
        );
      },
      (error: unknown) => {
        if (error instanceof TestTransactionRollback) {
          return;
        }
        throw error;
      },
    );

  // Race the handoff against the outer promise so a BEGIN failure (or any
  // other early rejection) surfaces here instead of hanging forever.
  currentTx = await Promise.race([
    started,
    outerTxPromise.then((): TestTx => {
      throw new Error(
        "integration-setup: outer transaction ended before it started",
      );
    }),
  ]);
});

afterEach(async () => {
  if (!client) {
    return;
  }

  try {
    releaseHold?.();
    if (outerTxPromise) {
      await outerTxPromise;
    }
  } finally {
    await client.end();
    client = undefined;
    currentTx = undefined;
    outerTxPromise = undefined;
    releaseHold = undefined;
  }
});

export function getTestDb(): NodePgDatabase<typeof schema> {
  if (!currentTx) {
    throw new Error(
      "getTestDb() called outside of a test. Make sure integration-setup.ts is loaded.",
    );
  }
  return currentTx;
}

export function getTestClient(): pg.Client {
  if (!client) {
    throw new Error("getTestClient() called outside of a test.");
  }
  return client;
}
