import { NextResponse } from "next/server";
import { env } from "@/env";
import { authorizeCronRequest } from "@/modules/platform";
import {
  CRON_BATCH_SIZE,
  runOutboxDrain,
} from "@/modules/platform/outbox-worker";

/**
 * The scheduled sweep. Since ADR 0017 this is the *retry* path, not the path a
 * paying member waits on — the webhook drains its own row from an `after()`
 * callback, and this picks up whatever that failed to finish.
 *
 * The worker itself lives in `src/modules/platform/outbox-worker.ts`, which is
 * the module architecture.md §2 gives the outbox to.
 */
export async function GET(req: Request) {
  const unauthorized = authorizeCronRequest(req, env.server.CRON_SECRET);
  if (unauthorized) return unauthorized;

  const result = await runOutboxDrain(CRON_BATCH_SIZE);

  return NextResponse.json({ success: true, ...result });
}
