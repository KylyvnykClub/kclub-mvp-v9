import { generateCodeVerifier, generateState } from "arctic";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { GOOGLE_SCOPES, googleProvider } from "@/modules/identity/google";

/**
 * Start "sign in with Google" (ADR 0029).
 *
 * A Route Handler rather than a Server Action because the caller on the other
 * end of this flow is Google, not us — `architecture.md` §2 draws that line.
 *
 * Two secrets go into cookies and come back out at the callback: the `state`,
 * which is what makes a forged callback fail, and the PKCE verifier, which is
 * what stops an intercepted authorization code from being redeemed by anyone
 * else. Both are `httpOnly` — no script of ours reads them — and both expire
 * in ten minutes, which is longer than a consent screen takes and shorter than
 * an abandoned tab lives.
 */

const TEN_MINUTES = 60 * 10;

// Not async: nothing here awaits, and the lint rule is right to say so.
export function GET(request: NextRequest) {
  const google = googleProvider();

  // A deployment with no Google client does not have a broken button; it has
  // no button, and this route does not exist.
  if (!google) {
    return new NextResponse(null, { status: 404 });
  }

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = google.createAuthorizationURL(state, codeVerifier, GOOGLE_SCOPES);

  const response = NextResponse.redirect(url);
  const secure = process.env.NODE_ENV === "production";

  for (const [name, value] of [
    ["google_oauth_state", state],
    ["google_oauth_verifier", codeVerifier],
    // Where to come back to, so a member who started in Ukrainian is not
    // returned to an English screen.
    ["google_oauth_locale", readLocale(request)],
  ] as const) {
    response.cookies.set(name, value, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: TEN_MINUTES,
    });
  }

  return response;
}

/** The locale the member was on, or the default if the caller made one up. */
function readLocale(request: NextRequest): string {
  const asked = request.nextUrl.searchParams.get("locale") ?? "";

  return (routing.locales as readonly string[]).includes(asked)
    ? asked
    : routing.defaultLocale;
}
