"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentMember } from "@/actions/session";
import { buildActor } from "@/domain/actor";
import { assertCan } from "@/domain/authorization";
import { emailSchema } from "@/lib/email";
import { logger } from "@/lib/logger";
import { safeErrorFields } from "@/lib/safe-error";
import { IdentityService } from "@/modules/identity/service";

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
 * Claim an address and send the link that proves it (FR-001, ADR 0028).
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

    const result = await IdentityService.claimEmail({
      memberId: auth.member.id,
      currentEmail: auth.member.email,
      email: parsed.data.email,
      displayName: auth.member.displayName,
      locale: normaliseLocale(auth.member.language),
    });

    revalidatePath("/dashboard/profile");

    return result.ok ? { status: "sent" } : { status: result.reason };
  } catch (error) {
    logger.error("email claim failed", safeErrorFields(error));
    return { status: "failed" };
  }
}

export type EmailConfirmState = { status: "idle" | "confirmed" | "invalid" };

/**
 * Redeem the link (ADR 0028).
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

/** The member's stored language, narrowed to the three the emails exist in. */
function normaliseLocale(language: string): "en" | "ru" | "uk" {
  return language === "ru" || language === "uk" ? language : "en";
}
