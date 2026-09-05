"use server";

import { cookies, headers } from "next/headers";
import { IdentityService, verifyTurnstileToken } from "@/modules/identity";
import { localeCookieOptions } from "@/lib/locale-cookie";
import { z } from "zod";
import { getLegalDocument } from "@/lib/mdx";
import {
  AGE_ATTESTATION_VERSION,
  CONSENT_DOCUMENT_IDS,
  consentSourceDocument,
  type ConsentAcceptance,
} from "@/lib/legal-consents";
import { emailLookupSchema } from "@/lib/email";
import { registerSchema } from "@/lib/registration-schema";
import {
  registerErrorField,
  type RegisterErrorCode,
} from "@/domain/registration";
import { readLoginIdentifier } from "@/lib/login-identifier";
import {
  PENDING_IDENTITY_COOKIE,
  openPendingIdentity,
} from "@/lib/pending-identity";
import { env } from "@/env";
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
    if (err instanceof RateLimited) {
      return { success: false, error: "Too many attempts. Try again later." };
    }
    if (err instanceof z.ZodError)
      return { success: false, error: err.issues[0]?.message };
    return { success: false, error: "Failed to send verification code" };
  }
}

/**
 * FR-091: make the member's saved language the locale from now on.
 *
 * next-intl reads this cookie ahead of `Accept-Language`, so writing it here is
 * what puts a stated preference above a browser default. Called wherever the
 * preference becomes known or changes; a value we no longer publish is ignored
 * rather than written back.
 */
async function rememberPreferredLocale(language: unknown): Promise<void> {
  const options = localeCookieOptions(language);
  if (!options) return;

  const cookieStore = await cookies();
  cookieStore.set(options.name, options.value, {
    maxAge: options.maxAge,
    sameSite: options.sameSite,
    path: options.path,
  });
}

/**
 * Every submitted acknowledgement must reference the version currently
 * published for that document (FR-093, FR-097). A stale or fabricated
 * version fails registration; the recorded version is always the one the
 * member saw at submit time.
 */
async function consentVersionsMatch(
  consents: ConsentAcceptance[],
): Promise<boolean> {
  for (const consent of consents) {
    const sourceDocument = consentSourceDocument(consent.documentId);
    if (consent.documentId === "age-verification") {
      if (consent.version !== AGE_ATTESTATION_VERSION) {
        return false;
      }
      continue;
    }
    const published = await getLegalDocument(sourceDocument, "en");
    if (!published || published.version !== consent.version) {
      return false;
    }
  }
  return true;
}

export async function registerAction(formData: FormData) {
  try {
    const headerList = await headers();
    const userAgent = headerList.get("user-agent") || "unknown";
    const ipAddress =
      headerList.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

    const raw = Object.fromEntries(formData);
    const consentsField = formData.get("consents");
    const rawConsents: unknown =
      typeof consentsField === "string" ? JSON.parse(consentsField) : [];
    const data = registerSchema.parse({ ...raw, consents: rawConsents });

    const requiredIds = new Set(CONSENT_DOCUMENT_IDS);
    const submittedIds = new Set(data.consents.map((c) => c.documentId));
    const allAccepted =
      submittedIds.size === requiredIds.size &&
      [...requiredIds].every((id) => submittedIds.has(id));

    if (!allAccepted) {
      return { success: false, error: "consents_required" as const };
    }

    if (!(await consentVersionsMatch(data.consents))) {
      return { success: false, error: "consents_stale" as const };
    }

    // The bot gate runs before the account is created and before any password
    // is hashed, so a rejected attempt costs nothing (ADR 0012).
    const turnstile = await verifyTurnstileToken(
      data.turnstileToken,
      ipAddress,
    );
    if (!turnstile.ok) {
      return {
        success: false,
        error: (turnstile.reason === "unavailable"
          ? "challenge_unavailable"
          : "challenge") as RegisterErrorCode,
      };
    }

    // A Google identity parked by the callback (ADR 0029). It only counts for
    // the address it actually vouched for: a member who arrived through Google
    // and then typed a different address gets the ordinary emailed link.
    const cookieStore = await cookies();
    const pending = openPendingIdentity(
      cookieStore.get(PENDING_IDENTITY_COOKIE)?.value,
      env.server.BETTER_AUTH_SECRET,
    );
    const provenBy =
      pending && pending.email === data.email
        ? ({
            provider: "google",
            providerAccountId: pending.subject,
          } as const)
        : undefined;

    const result = await IdentityService.registerMember({
      phone: data.phone,
      email: data.email,
      provenBy,
      code: data.code,
      passwordPlain: data.password,
      displayName: data.displayName,
      country: data.country,
      language: data.language,
      userAgent,
      ipAddress,
      consents: data.consents,
    });

    if (result.success && result.sessionToken) {
      // Spent, whether or not it was used: a stale identity cookie left on the
      // browser would attach to the next registration from this machine.
      cookieStore.set(PENDING_IDENTITY_COOKIE, "", { path: "/", maxAge: 0 });

      cookieStore.set("session", result.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
      await rememberPreferredLocale(data.language);
      return { success: true };
    } else {
      const error = result.error ?? ("failed" as const);
      return { success: false, error, field: registerErrorField(error) };
    }
  } catch (err) {
    // The issue's own message is not returned: it is written by Zod, in
    // English, and would be the one part of registration an applicant could
    // not read in their own language (FR-090).
    if (err instanceof z.ZodError) {
      return {
        success: false,
        error: "invalid_input" as const,
        field: zodField(err),
      };
    }
    return { success: false, error: "failed" as const };
  }
}

/**
 * Which box a schema failure belongs against, where it is one of the two
 * identifiers. Anything else is a form-level refusal — the form marks its own
 * required fields, so a missing name is already visible without this.
 */
function zodField(error: z.ZodError): "phone" | "email" | null {
  const path = error.issues[0]?.path[0];
  return path === "phone" || path === "email" ? path : null;
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
