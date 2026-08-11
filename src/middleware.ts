import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { redisRestRateLimiter } from "./modules/platform/rate-limit";

const intlMiddleware = createMiddleware(routing);

const protectedPaths = ["/dashboard", "/admin"];
const cardVerificationPath = /^\/(en|ru|uk)\/card\/[^/]+$/;
const cardVerificationLimit = 30;
const cardVerificationWindowMs = 60_000;

function clientIp(req: NextRequest) {
  const forwardedFor = req.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    forwardedFor ??
    "unknown"
  );
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (cardVerificationPath.test(pathname)) {
    const limiter = redisRestRateLimiter(
      process.env.UPSTASH_REDIS_REST_URL ?? "",
      process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
    );

    try {
      const result = await limiter.check(
        `card:ip:${clientIp(req)}`,
        cardVerificationLimit,
        cardVerificationWindowMs,
      );
      if (!result.allowed) {
        return NextResponse.json(
          { error: "rate_limited" },
          {
            status: 429,
            headers: {
              "retry-after": String(Math.ceil(result.resetMs / 1000)),
            },
          },
        );
      }
    } catch {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "retry-after": "60" } },
      );
    }
  }

  // Basic session cookie check for protected routes.
  // Full verification happens in Server Components/Actions.
  const isProtected = protectedPaths.some((p) => pathname.includes(p));
  if (isProtected) {
    const session = req.cookies.get("session");
    if (!session) {
      // Find the locale from URL or default
      const localeMatch = pathname.match(/^\/(en|ru|uk)\//);
      const locale = localeMatch ? localeMatch[1] : "en";
      const loginUrl = new URL(`/${locale}/login`, req.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return intlMiddleware(req);
}

export const config = {
  matcher: ["/", "/(en|ru|uk)/:path*"],
};
