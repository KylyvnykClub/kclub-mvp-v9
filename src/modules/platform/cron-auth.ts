import { NextResponse } from "next/server";

export function authorizeCronRequest(
  req: Request,
  cronSecret: string | undefined,
) {
  const authHeader = req.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  return null;
}
