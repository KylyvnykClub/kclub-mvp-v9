"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { RateLimited } from "@/domain/errors";
import { emailLookupSchema } from "@/lib/email";
import { readLoginIdentifier } from "@/lib/login-identifier";
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
 * Self-service password reset (FR-006, ADR 0028).
 *
 * The screen this serves says one thing whatever happens, so these states
 * carry no information about who exists. `sent` means the request was
 * accepted, not that a message went anywhere.
 */
export type ResetRequestState = {
  status: "idle" | "sent" | "invalid" | "throttled" | "challenge" | "failed";
};

const requestSchema = z.object({
  phone: phoneLookupSchema.optional(),
  email: emailLookupSchema.optional(),
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

    if (!parsed.success) {
      return { status: "invalid" };
    }

    const identifier = readLoginIdentifier(parsed.data);

    if (!identifier) {
      return { status: "invalid" };
    }

    // The bot gate runs before anything is looked up, so a rejected attempt
    // costs a lookup nothing - the same reasoning registration uses (ADR 0012).
    // security.md §6 called this flow out by name as one to gate once it
    // existed.
    const turnstile = await verifyTurnstileToken(
      parsed.data.turnstileToken,
      ipAddress,
    );

    if (!turnstile.ok) {
      return { status: "challenge" };
    }

    // Tighter than sign-in: this form sends mail to an address the caller
    // names, so an unlimited one is an outbound spam cannon aimed at whoever
    // they like.
    await assertRateLimit(
      authRateLimiter(),
      `reset:id:${identifier.kind}:${identifier.value}`,
      3,
      60 * 60 * 1000,
    );
    await assertRateLimit(
      authRateLimiter(),
      `reset:ip:${ipAddress}`,
      10,
      60 * 60 * 1000,
    );

    await IdentityService.requestPasswordReset({ identifier });

    return { status: "sent" };
  } catch (error) {
    if (error instanceof RateLimited) {
      return { status: "throttled" };
    }

    logger.error("password reset request failed", safeErrorFields(error));
    return { status: "failed" };
  }
}

export type ResetCompleteState = {
  status: "idle" | "done" | "invalid" | "mismatch" | "weak" | "failed";
};

const completeSchema = z
  .object({
    token: z.string().min(1).max(256),
    // The same floor registration enforces. Kept in step with it deliberately:
    // a reset that accepted weaker passwords than registration would be the
    // easiest way to weaken an account.
    password: z.string().min(8).max(100),
    confirmPassword: z.string().min(1).max(100),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
  });

export async function completePasswordResetAction(
  _prevState: ResetCompleteState | null,
  formData: FormData,
): Promise<ResetCompleteState> {
  const parsed = completeSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    const issue = parsed.error.issues[0];

    if (issue?.path[0] === "confirmPassword") return { status: "mismatch" };
    if (issue?.path[0] === "password") return { status: "weak" };

    return { status: "invalid" };
  }

  try {
    const reset = await IdentityService.resetPassword({
      token: parsed.data.token,
      passwordPlain: parsed.data.password,
    });

    return reset ? { status: "done" } : { status: "invalid" };
  } catch (error) {
    logger.error("password reset failed", safeErrorFields(error));
    return { status: "failed" };
  }
}
