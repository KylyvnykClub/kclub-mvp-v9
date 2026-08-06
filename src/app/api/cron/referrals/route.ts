import { NextResponse } from "next/server";
import { db } from "@/data/db";
import { expireDeliveredReferrals } from "@/data/referrals";
import { env } from "@/env";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (
    env.server.CRON_SECRET &&
    authHeader !== `Bearer ${env.server.CRON_SECRET}`
  ) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // FR-077: expire delivered referrals past their expiry, deleting the
  // contact details in the same statement.
  const expiredCount = await expireDeliveredReferrals(db, new Date());

  return NextResponse.json({ success: true, expiredCount });
}
