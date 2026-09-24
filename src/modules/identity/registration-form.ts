import { cookies, headers } from "next/headers";
import { z } from "zod";

import { db } from "@/data/db";
import { findActiveJoinLinkById } from "@/data/join-links";
import { env } from "@/env";
import {
  AGE_ATTESTATION_VERSION,
  CONSENT_DOCUMENT_IDS,
  consentSourceDocument,
  type ConsentAcceptance,
} from "@/lib/legal-consents";
import { getLegalDocument } from "@/lib/mdx";
import { localeCookieOptions } from "@/lib/locale-cookie";
import {
  PENDING_IDENTITY_COOKIE,
  openPendingIdentity,
} from "@/lib/pending-identity";
import { PENDING_JOIN_COOKIE, openPendingJoin } from "@/lib/pending-join";
import { registerSchema } from "@/lib/registration-schema";
import {
  registerErrorField,
  type RegisterErrorCode,
} from "@/domain/registration";
import { RateLimited } from "@/domain/errors";
import {
  assertRateLimit,
  authRateLimiter,
} from "@/modules/platform/rate-limit";

import { IdentityService } from "./service";
import { verifyTurnstileToken } from "./turnstile";

/**
 * Create an account from a submitted registration form (FR-001).
 *
 * This is the body of `registerAction`, lifted out of the Server Action file
 * so a second form can use it without duplicating it. The partner application
 * (FR-109) creates an account and a company from one submit, and the two
 * cannot be two round trips: the applicant pressed the button once, and an
 * account created with no company behind it would be a business partner with a
 * membership they never asked for.
 *
 * It returns the new member's id rather than expecting the caller to read the
 * session cookie it has just written. Reading back a cookie set earlier in the
 * same request is the kind of thing that works until it does not, and the
 * failure would be silent - an account with no application against it.
 *
 * Everything the account form enforces is enforced here, in this order: the
 * acknowledgements, the bot gate, the rate limit, then the account. The bot
 * gate runs before any password is hashed so a rejected attempt costs nothing,
 * and the rate limit runs after it so a rejected challenge does not spend a
 * real applicant's budget (ADR 0012, ADR 0030).
 */

export type RegistrationOutcome =
  | {
      success: true;
      memberId: string;
      /** The dues screen is next unless this member owes nothing (FR-103). */
      duesOwed: boolean;
    }
  | {
      success: false;
      error: RegisterErrorCode;
      /** The box the refusal belongs against, where it is one of the two. */
      field?: "phone" | "email" | null;
    };

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

/**
 * FR-091: make the member's saved language the locale from now on.
 *
 * next-intl reads this cookie ahead of `Accept-Language`, so writing it here is
 * what puts a stated preference above a browser default. Called wherever the
 * preference becomes known or changes; a value we no longer publish is ignored
 * rather than written back.
 */
export async function rememberPreferredLocale(
  language: unknown,
): Promise<void> {
  const options = localeCookieOptions(language);
  if (!options) return;

  const cookieStore = await cookies();
  cookieStore.set(options.name, options.value, {
    maxAge: options.maxAge,
    sameSite: options.sameSite,
    path: options.path,
  });
}

export async function registerMemberFromForm(
  formData: FormData,
  options: {
    /**
     * `partner` for a business application: it never owes membership dues,
     * and a join link cannot make it sponsored because there is nothing to
     * sponsor (ADR 0036).
     */
    duesKind?: "partner";
  } = {},
): Promise<RegistrationOutcome> {
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
      return { success: false, error: "consents_required" };
    }

    if (!(await consentVersionsMatch(data.consents))) {
      return { success: false, error: "consents_stale" };
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
        error:
          turnstile.reason === "unavailable"
            ? "challenge_unavailable"
            : "challenge",
      };
    }

    // ADR 0030 lets registration disclose that a phone number already belongs
    // to a member, and rests that trade on a 20-an-hour cap. Until this form
    // became one screen the cap lived on the first step's lookup; with the SMS
    // code postponed (ADR 0012) that step is not called at all, and the
    // disclosure now arrives here instead, out of the unique constraint. So
    // the cap lives here too, or ADR 0030's bound is a sentence in a document
    // and nothing else. Placed after the bot gate so a rejected challenge does
    // not spend a real applicant's budget.
    await assertRateLimit(
      authRateLimiter(),
      `register:submit:ip:${ipAddress}`,
      20,
      60 * 60 * 1000,
    );

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

    // FR-105: the join link waives dues, and only the cookie the link itself
    // set can say so. Nothing the form posted is consulted, and the cookie is
    // spent below whether or not it applied.
    const pendingJoin = openPendingJoin(
      cookieStore.get(PENDING_JOIN_COOKIE)?.value,
      env.server.BETTER_AUTH_SECRET,
    );
    // And the door has to still be open: the seal says it was, half an hour
    // ago at most, but revoking a leaked link must take effect at once.
    const sponsored = pendingJoin
      ? Boolean(await findActiveJoinLinkById(db, pendingJoin.joinLinkId))
      : false;

    const duesKind =
      options.duesKind === "partner"
        ? ("partner" as const)
        : sponsored
          ? ("sponsored" as const)
          : ("paying" as const);

    const result = await IdentityService.registerMember({
      phone: data.phone,
      email: data.email,
      duesKind,
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

    if (result.success && result.sessionToken && result.memberId) {
      // Spent, whether or not it was used: a stale identity cookie left on the
      // browser would attach to the next registration from this machine.
      cookieStore.set(PENDING_IDENTITY_COOKIE, "", { path: "/", maxAge: 0 });
      // Spent for the same reason: a join cookie left on the browser would
      // waive dues for the next registration from this machine too.
      cookieStore.set(PENDING_JOIN_COOKIE, "", { path: "/", maxAge: 0 });

      cookieStore.set("session", result.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
      await rememberPreferredLocale(data.language);

      // Where to send them: a sponsored member is in, a partner owes a listing
      // rather than dues and is sent to its own screen, and everyone else owes
      // dues (FR-103, FR-110). The dashboard would only bounce them anyway;
      // saying so now saves the flash of a screen they cannot have.
      return {
        success: true,
        memberId: result.memberId,
        duesOwed: duesKind === "paying",
      };
    }

    const error = result.error ?? ("failed" as const);
    return { success: false, error, field: registerErrorField(error) };
  } catch (err) {
    if (err instanceof RateLimited) {
      return { success: false, error: "throttled" };
    }

    // The issue's own message is not returned: it is written by Zod, in
    // English, and would be the one part of registration an applicant could
    // not read in their own language (FR-090).
    if (err instanceof z.ZodError) {
      return { success: false, error: "invalid_input", field: zodField(err) };
    }
    return { success: false, error: "failed" };
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
