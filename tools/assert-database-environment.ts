/**
 * The one way a tool under `tools/` checks which database it is about to
 * touch (ADR 0026).
 *
 * Every script that opens DATABASE_URL calls `assertDatabaseEnvironment` before
 * its first statement; `tests/constraints/database-tools-guarded.test.ts`
 * fails the build for one that does not. The decision itself is the pure
 * `devToolVerdict` in `src/lib/database-environment-guard.ts`; this file only
 * reads the marker, prints what it found, and exits on a refusal.
 *
 * The marker is read over Neon's HTTP driver on a client of its own rather
 * than through `src/data/db`: that module's Pool is a process-wide singleton
 * some tools keep using afterwards, and ending it here would break them, while
 * leaving it open keeps the process alive. HTTP has nothing to close.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import type { DbClient } from "../src/data/db";
import {
  readDatabaseMarker,
  type DatabaseMarker,
} from "../src/data/database-environment";
import * as schema from "../src/data/schema";
import {
  describeMarker,
  devToolVerdict,
  readAllowProductionDb,
} from "../src/lib/database-environment-guard";
import { describeDatabaseTarget } from "./beta-seed-guard";

/** A throwaway client for reading and writing the marker only. */
export function openMarkerClient(databaseUrl: string): DbClient {
  return drizzle(neon(databaseUrl), { schema }) as unknown as DbClient;
}

export interface AssertDatabaseEnvironmentOptions {
  /** Shown in the refusal, e.g. "db:seed". */
  tool: string;
  /** Whether the tool was invoked with --production. */
  productionFlag?: boolean;
  /**
   * Print the verdict but never exit. For tools whose job is production —
   * the beta purge has its own --confirm-production-purge — and for read-only
   * diagnostics.
   */
  reportOnly?: boolean;
}

export async function assertDatabaseEnvironment(
  options: AssertDatabaseEnvironmentOptions,
): Promise<DatabaseMarker> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local.");
    process.exit(1);
  }

  const marker = await readDatabaseMarker(openMarkerClient(databaseUrl));
  console.log(`TARGET: ${describeDatabaseTarget(databaseUrl)}`);
  console.log(`MARKER: ${describeMarker(marker)}`);

  const verdict = devToolVerdict({
    marker,
    nodeEnv: process.env["NODE_ENV"],
    vercelEnv: process.env["VERCEL_ENV"],
    allowProductionDb: readAllowProductionDb(process.env),
    productionFlag: options.productionFlag ?? false,
    tool: options.tool,
  });

  if (verdict.outcome === "warn") {
    console.warn(`\nWARNING: ${verdict.reason}\n`);
  } else if (verdict.outcome === "refuse") {
    if (options.reportOnly) {
      console.warn(
        `\nNOTE (not enforced for ${options.tool}): ${verdict.reason}\n`,
      );
    } else {
      console.error(`\nRefusing to continue. ${verdict.reason}\n`);
      process.exit(1);
    }
  }

  return marker;
}
