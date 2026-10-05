import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/data/db";
import { findActiveInviteLinkByCode } from "@/data/invite-links";
import { RateLimited } from "@/domain/errors";
import { env } from "@/env";
import {
  PENDING_INVITE_COOKIE,
  PENDING_INVITE_TTL_MS,
  sealPendingInvite,
} from "@/lib/pending-invite";
import { IdentityService } from "@/modules/identity";
import {
  assertRateLimit,
  authRateLimiter,
} from "@/modules/platform/rate-limit";

/**
 * A member's invite link (FR-123, ADR 0042).
 *
 * The join link's route (`join/[secret]`) with a member's link behind it: it
 * stamps a signed cookie and forwards, and grants nothing by itself. Whether
 * the newcomer is waived, and whether anyone is recorded at all, is decided
 * at registration from the inviter's standing then.
 *
 * An unknown or rotated code forwards to the ordinary form and says nothing,
 * for the same reason the join link does. A visitor who is already signed in
 * is sent to their cabinet with no cookie: links bring in new accounts only,
 * and an existing member is never re-attributed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string; code: string }> },
) {
  const { locale, code } = await params;

  // Relative Locations, as in the join route: the bound address is not the
  // one the browser asked for, and the cookie belongs to the latter.
  const forward = (path: string): NextResponse =>
    new NextResponse(null, {
      status: 307,
      headers: { Location: `/${locale}${path}` },
    });

  const sessionToken = request.cookies.get("session")?.value;
  if (
    sessionToken &&
    (await IdentityService.authenticateSession(sessionToken))
  ) {
    return forward("/dashboard/profile");
  }

  try {
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

    await assertRateLimit(
      authRateLimiter(),
      `invite:ip:${ipAddress}`,
      20,
      60 * 60 * 1000,
    );
  } catch (error) {
    if (error instanceof RateLimited) {
      return forward("/register");
    }
    throw error;
  }

  const link = await findActiveInviteLinkByCode(db, code);
  if (!link) {
    return forward("/register");
  }

  const response = forward(link.kind === "partner" ? "/partner" : "/register");

  response.cookies.set(
    PENDING_INVITE_COOKIE,
    sealPendingInvite(
      { inviteLinkId: link.id, expiresAt: Date.now() + PENDING_INVITE_TTL_MS },
      env.server.BETTER_AUTH_SECRET,
    ),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: PENDING_INVITE_TTL_MS / 1000,
    },
  );

  return response;
}
