"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { headers } from "next/headers";

import { getCurrentMember } from "@/actions/session";
import { buildActor } from "@/domain/actor";
import { assertCan } from "@/domain/authorization";
import { RateLimited } from "@/domain/errors";
import { emailSchema } from "@/lib/email";
import { narrowLocale } from "@/lib/locale";
import { logger } from "@/lib/logger";
import { safeErrorFields } from "@/lib/safe-error";
import { IdentityService } from "@/modules/identity/service";
import {
  assertRateLimit,
  authRateLimiter,
} from "@/modules/platform/rate-limit";

/**
 * A code, not a sentence. The screen that renders it has all three locales;
 * an English string returned from here would be the one part of the flow the
 * member could not read in their own language.
 */
export type EmailClaimStatus =
  | "idle"
  | "sent"
  | "unavailable"
  | "throttled"
  | "undeliverable"
  | "invalid"
  | "unauthorized"
  | "failed";

export type EmailClaimState = { status: EmailClaimStatus };

const claimSchema = z.object({ email: emailSchema });

/**
 * Claim an address and send the link that proves it (FR-001, ADR 0032).
 *
 * A Server Action is a public endpoint, so this authorises like one even
 * though the only screen that calls it is already behind the dashboard.
 */
export async function claimEmailAction(
  _prevState: EmailClaimState | null,
  formData: FormData,
): Promise<EmailClaimState> {
  try {
    const auth = await getCurrentMember();

    if (!auth?.member) {
      return { status: "unauthorized" };
    }

    assertCan(buildActor(auth.member), "update", "own_profile");

    const parsed = claimSchema.safeParse({ email: formData.get("email") });

    if (!parsed.success) {
      return { status: "invalid" };
    }

    // The service throttles a *resend* to the address already on the account,
    // and deliberately does not throttle a change — a member correcting a
    // typo should not be made to wait for the mistake. That leaves one hole,
    // which is this: a caller naming a different address every time takes the
    // unthrottled branch every time, and sends our mail to whatever inbox
    // they like. Authenticated is not the same as trusted; this bounds it by
    // who is asking and by where they are asking from, the way every other
    // outward-facing action in `src/actions` already does.
    const headerList = await headers();
    const ipAddress =
      headerList.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

    await assertRateLimit(
      authRateLimiter(),
      `email-claim:member:${auth.member.id}`,
      5,
      60 * 60 * 1000,
    );
    await assertRateLimit(
      authRateLimiter(),
      `email-claim:ip:${ipAddress}`,
      20,
      60 * 60 * 1000,
    );

    const result = await IdentityService.claimEmail({
      memberId: auth.member.id,
      currentEmail: auth.member.email,
      email: parsed.data.email,
      displayName: auth.member.displayName,
      locale: narrowLocale(auth.member.language),
    });

    revalidatePath("/dashboard/profile");

    return result.ok ? { status: "sent" } : { status: result.reason };
  } catch (error) {
    if (error instanceof RateLimited) {
      return { status: "throttled" };
    }

    logger.error("email claim failed", safeErrorFields(error));
    return { status: "failed" };
  }
}

export type EmailConfirmState = { status: "idle" | "confirmed" | "invalid" };

/**
 * Redeem the link (ADR 0032).
 *
 * Deliberately a POST behind a button rather than work done by opening the
 * URL: mail clients and security scanners follow links in messages, and a
 * one-time token spent by a scanner is a member who cannot verify their own
 * address.
 *
 * No session is required. The link may well be opened in a browser the member
 * has never signed in on — that is the case it exists for.
 */
export async function confirmEmailAction(
  _prevState: EmailConfirmState | null,
  formData: FormData,
): Promise<EmailConfirmState> {
  const token = formData.get("token");

  if (typeof token !== "string" || token.length === 0) {
    return { status: "invalid" };
  }

  try {
    const confirmed = await IdentityService.confirmEmail(token);

    if (!confirmed) {
      return { status: "invalid" };
    }

    revalidatePath("/dashboard/profile");
    return { status: "confirmed" };
  } catch (error) {
    logger.error("email confirmation failed", safeErrorFields(error));
    return { status: "invalid" };
  }
}
