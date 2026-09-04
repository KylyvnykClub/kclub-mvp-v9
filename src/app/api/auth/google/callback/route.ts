import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/data/db";
import {
  createSessionTx,
  findMemberByEmail,
  findMemberByProviderAccount,
  linkProviderAccount,
} from "@/data/identity";
import { isStaffRole, normalizeRole } from "@/domain/actor";
import { env } from "@/env";
import { localeCookieOptions } from "@/lib/locale-cookie";
import { logger } from "@/lib/logger";
import {
  PENDING_IDENTITY_COOKIE,
  PENDING_IDENTITY_TTL_MS,
  sealPendingIdentity,
} from "@/lib/pending-identity";
import { safeErrorFields } from "@/lib/safe-error";
import { generateToken } from "@/modules/identity/crypto";
import {
  googleEnabled,
  googleProvider,
  readGoogleIdentity,
} from "@/modules/identity/google";
import { routing } from "@/i18n/routing";

/**
 * Where Google sends the member back (ADR 0029).
 *
 * Three outcomes, and only the first is a sign-in:
 *
 *  - the Google account is already linked, or its **verified** address matches
 *    a member who has **proved** that address here — sign them in;
 *  - nobody holds that address — park the proved identity in a signed cookie
 *    and send them to registration, because Google cannot supply the phone
 *    number that is still mandatory (ADR 0028);
 *  - anything else — back to sign-in with a reason, and no session.
 *
 * Staff never come through here. They hold a mandatory second factor
 * (FR-080), and this route cannot ask for it; ADR 0007 keeps their identities
 * separate anyway.
 */

const OAUTH_COOKIES = [
  "google_oauth_state",
  "google_oauth_verifier",
  "google_oauth_locale",
] as const;

export async function GET(request: NextRequest) {
  const google = googleProvider();

  if (!google || !(await googleEnabled())) {
    return new NextResponse(null, { status: 404 });
  }

  const locale = request.cookies.get("google_oauth_locale")?.value ?? "";
  const safeLocale = (routing.locales as readonly string[]).includes(locale)
    ? locale
    : routing.defaultLocale;

  const back = (reason: string) =>
    clear(
      NextResponse.redirect(
        new URL(`/${safeLocale}/login?error=${reason}`, request.url),
      ),
    );

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get("google_oauth_state")?.value;
  const verifier = request.cookies.get("google_oauth_verifier")?.value;

  // A callback that does not carry back the state we issued did not start
  // here. Nothing else about it is worth inspecting.
  if (
    !code ||
    !state ||
    !expectedState ||
    state !== expectedState ||
    !verifier
  ) {
    return back("google_state");
  }

  let identity;

  try {
    const tokens = await google.validateAuthorizationCode(code, verifier);
    identity = readGoogleIdentity(tokens.idToken());
  } catch (error) {
    logger.error("google token exchange failed", safeErrorFields(error));
    return back("google_exchange");
  }

  if (!identity) {
    return back("google_exchange");
  }

  // An address Google itself has not verified proves nothing. It would be the
  // whole attack: claim any address at a provider, sign in as its owner here.
  if (!identity.emailVerified) {
    return back("google_unverified");
  }

  const linked = await findMemberByProviderAccount(
    db,
    "google",
    identity.subject,
  );

  const byEmail = linked ? null : await findMemberByEmail(db, identity.email);

  // Matching an existing account by address requires that *we* have proof of
  // it too. Otherwise someone who registered with a stranger's address and
  // never confirmed it would collect that stranger's Google sign-in.
  const member = linked ?? (byEmail?.emailVerifiedAt ? byEmail : null);

  if (!member) {
    return byEmail
      ? // The address is spoken for by an account that never proved it. Not a
        // sign-in, and not a new registration either.
        back("google_no_match")
      : startRegistration(request, safeLocale, identity);
  }

  if (isStaffRole(normalizeRole(member.role))) {
    return back("google_staff");
  }

  if (member.status !== "active") {
    return back("account_blocked");
  }

  const sessionToken = generateToken();

  try {
    await linkProviderAccount(db, {
      memberId: member.id,
      provider: "google",
      providerAccountId: identity.subject,
    });

    await createSessionTx(db, {
      memberId: member.id,
      sessionToken,
      userAgent: request.headers.get("user-agent") ?? "unknown",
      ipAddress:
        request.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1",
    });
  } catch (error) {
    // The likeliest cause is the second unique index: this member already has
    // a different Google account linked.
    logger.error("google sign-in could not be completed", {
      memberId: member.id,
      ...safeErrorFields(error),
    });
    return back("google_link");
  }

  const response = clear(
    NextResponse.redirect(
      new URL(`/${safeLocale}/dashboard/profile`, request.url),
    ),
  );

  response.cookies.set("session", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  const preference = localeCookieOptions(member.language);
  if (preference) {
    response.cookies.set(preference.name, preference.value, {
      maxAge: preference.maxAge,
      sameSite: preference.sameSite,
      path: preference.path,
    });
  }

  return response;
}

/**
 * Nobody holds this address, so this is a new member — but Google cannot give
 * us a phone number, and one is required. The proved identity rides to the
 * registration form in a signed cookie; the form fills in the rest.
 */
function startRegistration(
  request: NextRequest,
  locale: string,
  identity: {
    subject: string;
    email: string;
    displayName: string | null;
  },
): NextResponse {
  const response = clear(
    NextResponse.redirect(new URL(`/${locale}/register`, request.url)),
  );

  response.cookies.set(
    PENDING_IDENTITY_COOKIE,
    sealPendingIdentity(
      {
        provider: "google",
        subject: identity.subject,
        email: identity.email,
        displayName: identity.displayName,
        expiresAt: Date.now() + PENDING_IDENTITY_TTL_MS,
      },
      env.server.BETTER_AUTH_SECRET,
    ),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: PENDING_IDENTITY_TTL_MS / 1000,
    },
  );

  return response;
}

/** The one-shot cookies are spent whatever the outcome. */
function clear(response: NextResponse): NextResponse {
  for (const name of OAUTH_COOKIES) {
    response.cookies.set(name, "", { path: "/", maxAge: 0 });
  }

  return response;
}
