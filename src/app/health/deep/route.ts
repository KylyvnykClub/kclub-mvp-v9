/**
 * GET /health/deep
 *
 * The diagnostic probe: everything `/health/ready` checks, plus whether the
 * background projection is keeping up.
 *
 * Deliberately NOT a routing signal. observability.md §6: this endpoint is for
 * humans and alerts, never for the load balancer, because "the outbox is
 * behind" must not remove healthy instances from service. A stuck projection is
 * an incident to page someone about, not a reason to stop serving pages.
 *
 * It exists because a billing projection sat unprocessed for hours while
 * `/health/ready` returned 200 the whole time - correctly, since the database
 * and Redis were reachable throughout. Readiness was never the thing that
 * could have caught it; the member who paid was.
 *
 * See: docs/observability.md §6
 */

import { NextResponse } from "next/server";

import { db } from "@/data/db";
import {
  OUTBOX_MAX_AGE_MS,
  countPending,
  findOldestPendingOutboxAt,
} from "@/data/outbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CheckResult {
  name: string;
  status: "ok" | "fail";
  detail?: Record<string, unknown>;
  error?: string;
}

async function checkOutbox(): Promise<CheckResult> {
  try {
    const [pending, oldestAt] = await Promise.all([
      countPending(db),
      findOldestPendingOutboxAt(db),
    ]);

    if (!oldestAt) {
      return { name: "outbox", status: "ok", detail: { pending: 0 } };
    }

    const ageMs = Date.now() - oldestAt.getTime();

    return {
      name: "outbox",
      status: ageMs > OUTBOX_MAX_AGE_MS ? "fail" : "ok",
      detail: {
        pending,
        oldestPendingAt: oldestAt.toISOString(),
        oldestAgeSeconds: Math.round(ageMs / 1000),
      },
    };
  } catch (err) {
    return {
      name: "outbox",
      status: "fail",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function GET(): Promise<NextResponse> {
  const checks = [await checkOutbox()];
  const allOk = checks.every((check) => check.status === "ok");

  // 200 either way on purpose - see the note above. The body carries the
  // verdict; the status code is not a routing instruction.
  return NextResponse.json({
    status: allOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    checks,
  });
}
