import { NextResponse } from "next/server";
import { db } from "@/data/db";
import { expireDeliveredReferrals } from "@/data/referrals";
import { env } from "@/env";
import { authorizeCronRequest } from "@/modules/platform";

export async function GET(req: Request) {
  const unauthorized = authorizeCronRequest(req, env.server.CRON_SECRET);
  if (unauthorized) return unauthorized;

  // FR-077: expire delivered referrals past their expiry, deleting the
  // contact details in the same statement.
  const expiredCount = await expireDeliveredReferrals(db, new Date());

  return NextResponse.json({ success: true, expiredCount });
}
