import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/data/db";
import { findActiveJoinLinkBySecret } from "@/data/join-links";
import { RateLimited } from "@/domain/errors";
import { env } from "@/env";
import {
  PENDING_JOIN_COOKIE,
  PENDING_JOIN_TTL_MS,
  sealPendingJoin,
} from "@/lib/pending-join";
import {
  assertRateLimit,
  authRateLimiter,
} from "@/modules/platform/rate-limit";

/**
 * The club's join link (FR-105, ADR 0033).
 *
 * A Route Handler rather than a page because it sets a cookie and forwards,
 * and a Server Component may do neither. The caller is whoever was handed the
 * link, which is the external caller `architecture.md` §2 asks for.
 *
 * A secret that does not match an active link forwards to the ordinary
 * registration form and says nothing at all. Saying "no such link" would tell a
 * prober when they had guessed a prefix; saying nothing costs a genuine holder
 * of a revoked link one confused moment and a message to the club.
 *
 * Rate limited by address because the whole cost of guessing a secret is how
 * many can be tried — the same reasoning, and the same limiter, as
 * registration's.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string; secret: string }> },
) {
  const { locale, secret } = await params;

  /**
   * A *relative* Location, deliberately. Both `request.url` and
   * `request.nextUrl` carry the address the server is bound to — `0.0.0.0`
   * behind a proxy or in a container — and redirecting there sends the browser
   * to a different origin, which leaves the cookie this route just set behind
   * on the old one. The browser resolves a relative Location against the
   * address it actually asked for, which is the one the cookie belongs to.
   */
  const registration = (): NextResponse =>
    new NextResponse(null, {
      status: 307,
      headers: { Location: `/${locale}/register` },
    });

  try {
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

    await assertRateLimit(
      authRateLimiter(),
      `join:ip:${ipAddress}`,
      20,
      60 * 60 * 1000,
    );
  } catch (error) {
    if (error instanceof RateLimited) {
      return registration();
    }
    throw error;
  }

  const link = await findActiveJoinLinkBySecret(db, secret);
  if (!link) {
    return registration();
  }

  const response = registration();

  response.cookies.set(
    PENDING_JOIN_COOKIE,
    sealPendingJoin(
      { joinLinkId: link.id, expiresAt: Date.now() + PENDING_JOIN_TTL_MS },
      env.server.BETTER_AUTH_SECRET,
    ),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: PENDING_JOIN_TTL_MS / 1000,
    },
  );

  return response;
}
