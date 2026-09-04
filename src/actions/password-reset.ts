"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { RateLimited } from "@/domain/errors";
import { logger } from "@/lib/logger";
import { phoneLookupSchema } from "@/lib/phone";
import { safeErrorFields } from "@/lib/safe-error";
import { IdentityService } from "@/modules/identity/service";
import { verifyTurnstileToken } from "@/modules/identity/turnstile";
import {
  assertRateLimit,
  authRateLimiter,
} from "@/modules/platform/rate-limit";

/**
 * Asking staff to reset a password (FR-006, ADR 0031).
 *
 * `sent` means the request was accepted, not that anything reached anyone. The
 * screen says the same thing whatever happened, so these states carry nothing
 * about who exists.
 */
export type ResetRequestState = {
  status: "idle" | "sent" | "invalid" | "throttled" | "challenge" | "failed";
};

const requestSchema = z.object({
  phone: phoneLookupSchema,
  turnstileToken: z.string().max(2048).optional(),
});

export async function requestPasswordResetAction(
  _prevState: ResetRequestState | null,
  formData: FormData,
): Promise<ResetRequestState> {
  try {
    const headerList = await headers();
    const ipAddress =
      headerList.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

    const parsed = requestSchema.safeParse(Object.fromEntries(formData));

    if (!parsed.success || parsed.data.phone.length === 0) {
      return { status: "invalid" };
    }

    // The bot gate runs before anything is looked up, so a rejected attempt
    // costs a lookup nothing — the same reasoning registration uses (ADR 0012).
    const turnstile = await verifyTurnstileToken(
      parsed.data.turnstileToken,
      ipAddress,
    );

    if (!turnstile.ok) {
      return { status: "challenge" };
    }

    // Tight, because the cost of probing this form is how many numbers can be
    // tried, and because every accepted request is a line on a staff screen.
    await assertRateLimit(
      authRateLimiter(),
      `reset:phone:${parsed.data.phone}`,
      3,
      60 * 60 * 1000,
    );
    await assertRateLimit(
      authRateLimiter(),
      `reset:ip:${ipAddress}`,
      10,
      60 * 60 * 1000,
    );

    await IdentityService.requestPasswordReset({ phone: parsed.data.phone });

    return { status: "sent" };
  } catch (error) {
    if (error instanceof RateLimited) {
      return { status: "throttled" };
    }

    logger.error("password reset request failed", safeErrorFields(error));
    return { status: "failed" };
  }
}
