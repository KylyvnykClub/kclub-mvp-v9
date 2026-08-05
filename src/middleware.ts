import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const intlMiddleware = createMiddleware(routing);

const protectedPaths = ["/dashboard", "/admin"];

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  
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
