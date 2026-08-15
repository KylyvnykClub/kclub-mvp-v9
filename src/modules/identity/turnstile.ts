import { z } from "zod";
import { env } from "@/env";
import { logger } from "@/lib/logger";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const siteverifyResponseSchema = z.object({
  success: z.boolean(),
  "error-codes": z.array(z.string()).optional(),
});

export type TurnstileOutcome =
  | { ok: true }
  | { ok: false; reason: "missing_token" | "rejected" | "unavailable" };

/**
 * Cloudflare Turnstile, the bot gate on registration (ADR 0012).
 *
 * While phone verification is postponed this is the only cost a bot pays to
 * create an account, so it fails closed: an unreachable Cloudflare rejects the
 * registration rather than waving it through. That is a deliberate trade of
 * availability for abuse resistance, and it applies to one endpoint.
 *
 * The check is skipped only when no secret is configured, which the env schema
 * permits outside production and refuses inside it.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string,
): Promise<TurnstileOutcome> {
  const secret = env.server.TURNSTILE_SECRET_KEY;

  if (!secret) {
    logger.warn(
      "Turnstile secret is not configured; skipping the registration bot check",
    );
    return { ok: true };
  }

  if (!token) {
    return { ok: false, reason: "missing_token" };
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp && remoteIp !== "127.0.0.1") {
    body.set("remoteip", remoteIp);
  }

  try {
    const response = await fetch(SITEVERIFY_URL, { method: "POST", body });

    if (!response.ok) {
      logger.error(`Turnstile siteverify returned ${response.status}`);
      return { ok: false, reason: "unavailable" };
    }

    const parsed = siteverifyResponseSchema.safeParse(await response.json());

    if (!parsed.success) {
      logger.error("Turnstile siteverify returned an unreadable body");
      return { ok: false, reason: "unavailable" };
    }

    if (!parsed.data.success) {
      logger.warn("Turnstile rejected a registration attempt", {
        errors: (parsed.data["error-codes"] ?? []).join(","),
      });
      return { ok: false, reason: "rejected" };
    }

    return { ok: true };
  } catch (error) {
    logger.error("Turnstile siteverify request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, reason: "unavailable" };
  }
}
