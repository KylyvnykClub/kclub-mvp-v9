import { NextResponse } from "next/server";
import { db } from "@/data/db";
import { expireOverdueReferrals } from "@/data/referrals";
import { env } from "@/env";
import { authorizeCronRequest } from "@/modules/platform";

export async function GET(req: Request) {
  const unauthorized = authorizeCronRequest(req, env.server.CRON_SECRET);
  if (unauthorized) return unauthorized;

  // FR-077: expire referrals not acted on within 14 days (delivered or
  // still pending_review), deleting the contact details in the same
  // statement.
  const expiredCount = await expireOverdueReferrals(db, new Date());

  return NextResponse.json({ success: true, expiredCount });
}
