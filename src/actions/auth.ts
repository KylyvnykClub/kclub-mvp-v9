"use server";

import { cookies, headers } from "next/headers";
import { IdentityService } from "@/modules/identity";
import {
  registerMemberFromForm,
  rememberPreferredLocale,
} from "@/modules/identity/registration-form";
import { z } from "zod";
import { emailLookupSchema } from "@/lib/email";
import { readLoginIdentifier } from "@/lib/login-identifier";
import { phoneLookupSchema, phoneSchema } from "@/lib/phone";
import {
  assertRateLimit,
  authRateLimiter,
} from "@/modules/platform/rate-limit";
import { RateLimited } from "@/domain/errors";

const requestPhoneSchema = z.object({
  phone: phoneSchema,
});

/**
 * Step 1 of registration.
 *
 * This answer tells the caller whether a number is already registered
 * (`taken`), which is a deliberate reversal of what this action used to do and
 * of the enumeration rule in security.md §6 — see ADR 0030. The reasoning and
 * the price are in that record; the mitigations are here.
 *
 * Rate limited by address, tightly, because the whole cost of enumeration is
 * how many numbers can be tried. One person registering makes a handful of
 * attempts; a script walking a numbering plan makes thousands.
 */
export async function requestPhoneVerificationAction(formData: FormData) {
  try {
    const headerList = await headers();
    const ipAddress =
      headerList.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

    const data = requestPhoneSchema.parse(Object.fromEntries(formData));

    await assertRateLimit(
      authRateLimiter(),
      `register:phone-check:ip:${ipAddress}`,
      20,
      60 * 60 * 1000,
    );

    if (await IdentityService.isPhoneRegistered(data.phone)) {
      return { success: true, sent: false, taken: true };
    }

    const sent = await IdentityService.requestPhoneVerification(data.phone);
    return { success: true, sent, taken: false };
  } catch (err) {
    // Codes, like every other action here: this one is unreachable while SMS
    // is postponed (ADR 0012), and a sentence chosen now is a sentence that
    // reaches a Ukrainian applicant in English on the day Twilio comes back.
    if (err instanceof RateLimited) {
      return { success: false, error: "throttled" as const };
    }
    if (err instanceof z.ZodError) {
      return { success: false, error: "invalid_input" as const };
    }
    return { success: false, error: "failed" as const };
  }
}

/**
 * Registration from the member form (FR-001).
 *
 * The work is in `registerMemberFromForm`, shared with the partner
 * application (FR-109) so there is one registration and not two that drift.
 * What stays here is what the member form needs back: whether the dues screen
 * is the next stop.
 */
export async function registerAction(formData: FormData) {
  const result = await registerMemberFromForm(formData);

  if (result.success) {
    return { success: true as const, duesOwed: result.duesOwed };
  }

  return {
    success: false as const,
    error: result.error,
    field: result.field,
  };
}

// Sign-in looks an identifier up rather than claiming one, so both schemas
// normalise without validating - see the note on phoneLookupSchema. A member
// may arrive with either (FR-005, ADR 0032); the form says which tab they used.
const loginSchema = z.object({
  phone: phoneLookupSchema.optional(),
  email: emailLookupSchema.optional(),
  password: z.string().min(1),
});

export async function loginAction(formData: FormData) {
  try {
    const headerList = await headers();
    const userAgent = headerList.get("user-agent") || "unknown";
    const ipAddress =
      headerList.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

    const data = loginSchema.parse(Object.fromEntries(formData));
    const identifier = readLoginIdentifier(data);

    if (!identifier) {
      return { success: false, error: "invalid_credentials" as const };
    }

    // Neither sign-in nor registration was rate limited at all before this
    // (the limiter existed, wired only into the card-verification route), so
    // a password could be guessed as fast as argon2 would answer. Two keys:
    // the identifier, which stops one account being ground down, and the
    // address, which stops one host grinding down many accounts. FR-003's
    // numbers for code requests are the precedent for the shape.
    await assertRateLimit(
      authRateLimiter(),
      `login:id:${identifier.kind}:${identifier.value}`,
      10,
      15 * 60 * 1000,
    );
    await assertRateLimit(
      authRateLimiter(),
      `login:ip:${ipAddress}`,
      50,
      15 * 60 * 1000,
    );

    const result = await IdentityService.login({
      identifier,
      passwordPlain: data.password,
      userAgent,
      ipAddress,
    });

    if (result.success && result.sessionToken && result.requiresTotp) {
      const cookieStore = await cookies();
      cookieStore.set("session", result.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 15, // 15 minutes for partial session
      });
      await rememberPreferredLocale(result.language);
      return {
        success: true,
        requiresTotp: true,
        setupTotp: result.setupTotp,
        totpUri: result.totpUri,
      };
    } else if (result.success && result.sessionToken) {
      const cookieStore = await cookies();
      cookieStore.set("session", result.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
      await rememberPreferredLocale(result.language);
      return { success: true };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error) {
    if (error instanceof RateLimited) {
      return { success: false, error: "throttled" as const };
    }
    return { success: false, error: "failed" as const };
  }
}

// The seed is deliberately absent. It used to arrive here from the browser and
// be stored as-is, which meant the client chose which secret it would be judged
// against; the server now reads the seed it stored against the partial session.
const verifyTotpSchema = z.object({
  code: z.string().min(6).max(6),
});

export async function verifyTotpAction(formData: FormData) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return { success: false, error: "session_expired" as const };
    }

    const headerList = await headers();
    const userAgent = headerList.get("user-agent") || "unknown";
    const ipAddress =
      headerList.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

    const data = verifyTotpSchema.parse(Object.fromEntries(formData));

    const result = await IdentityService.verifyTotp({
      sessionToken: token,
      code: data.code,
      userAgent,
      ipAddress,
    });

    if (result.success) {
      // Upgrade the cookie duration to full 30 days
      cookieStore.set("session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
      return { success: true };
    }

    return { success: false, error: result.error };
  } catch {
    return { success: false, error: "failed" as const };
  }
}

export async function logoutAction() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (token) {
    await IdentityService.logout(token);
    cookieStore.delete("session");
  }
  return { success: true };
}
