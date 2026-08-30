/**
 * GET /health/ready
 *
 * Readiness probe: database and Redis are reachable.
 * Used by the load balancer and deployment gate.
 *
 * See: docs/observability.md §6
 */

import { NextResponse } from "next/server";
// eslint-disable-next-line kclub/no-db-outside-data
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CheckResult {
  name: string;
  status: "ok" | "fail";
  latencyMs: number;
  error?: string;
  /**
   * Database check only: what the database says it is (ADR 0026) —
   * `production`, `dev`, `preview`, `test`, or `unmarked` when the marker
   * table is absent or empty. Lets `pnpm smoke:deployment` prove a
   * deployment is on the database it should be.
   */
  environment?: string;
}

async function checkDatabase(): Promise<CheckResult> {
  const start = performance.now();
  try {
    const DATABASE_URL = process.env.DATABASE_URL;
    if (!DATABASE_URL) {
      return {
        name: "database",
        status: "fail",
        latencyMs: 0,
        error: "DATABASE_URL not set",
      };
    }
    const sql = neon(DATABASE_URL);
    // The reachability probe doubles as the marker-table check, so a
    // database without the marker migration still answers "ok".
    const [probe] = (await sql`
      SELECT to_regclass('public.database_environment') IS NOT NULL AS present
    `) as [{ present: boolean }];
    let environment = "unmarked";
    if (probe.present) {
      const [row] = (await sql`
        SELECT name FROM database_environment LIMIT 1
      `) as [{ name: string } | undefined];
      environment = row?.name ?? "unmarked";
    }
    return {
      name: "database",
      status: "ok",
      latencyMs: Math.round(performance.now() - start),
      environment,
    };
  } catch (err) {
    return {
      name: "database",
      status: "fail",
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function checkRedis(): Promise<CheckResult> {
  const start = performance.now();
  try {
    const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
    const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
      return {
        name: "redis",
        status: "fail",
        latencyMs: 0,
        error: "Redis credentials not set",
      };
    }
    const res = await fetch(`${UPSTASH_REDIS_REST_URL}/ping`, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return {
      name: "redis",
      status: "ok",
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (err) {
    return {
      name: "redis",
      status: "fail",
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function GET(): Promise<NextResponse> {
  const timeout = AbortSignal.timeout(5000);
  void timeout; // ensure reference

  const checks = await Promise.all([checkDatabase(), checkRedis()]);
  const allOk = checks.every((c) => c.status === "ok");

  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 },
  );
}
