/**
 * GET /health/live
 *
 * Liveness probe: the process is running. No dependencies are checked.
 * Used by the platform to decide whether to restart the process.
 *
 * See: docs/observability.md §6
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(): NextResponse {
  return NextResponse.json(
    { status: "ok", timestamp: new Date().toISOString() },
    { status: 200 },
  );
}
