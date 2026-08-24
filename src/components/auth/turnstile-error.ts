/**
 * Cloudflare Turnstile client-side failure codes.
 *
 * Turnstile reports a failure as a numeric string to `error-callback` and
 * nowhere else. The widget draws its own error box, but the code behind that
 * box never reaches the console, the server, or the member — which is how
 * `110200` (this deployment's hostname is absent from the widget's allowed
 * list) reached production disguised as "please complete the verification
 * challenge", a message that blames the member for an operator's mistake.
 *
 * The split matters because the correct response differs. A configuration
 * failure cannot be retried into success by anybody; it needs someone to change
 * the Cloudflare widget or the deployment. Everything else is worth another go.
 *
 * Codes: https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/
 */

export type TurnstileFailureKind =
  "configuration" | "unsupported" | "network" | "retryable";

export interface TurnstileFailure {
  /** Cloudflare's numeric code, or `network` when api.js never loaded. */
  code: string;
  kind: TurnstileFailureKind;
  /** True when retrying cannot help until an operator changes something. */
  operatorActionRequired: boolean;
}

/** Wrong key, or a hostname the widget was never told to accept. */
const CONFIGURATION_CODES = new Set([
  "110100", // invalid sitekey
  "110110", // sitekey not found
  "110200", // domain not allowed
  "110420", // invalid action
  "110430", // invalid cData
]);

/**
 * Parameters this site handed to Turnstile, reported as a family rather than a
 * list: `400020` is a malformed sitekey, and the rest of the 400 range is the
 * same shape of mistake. Observed live — a deliberately broken sitekey answers
 * `400020`, not the `110100` the sitekey-specific code would suggest.
 */
const CONFIGURATION_CODE_PREFIX = "400";

/** The visitor's browser cannot run the challenge at all. */
const UNSUPPORTED_CODES = new Set([
  "110500", // unsupported browser
  "110510", // inconsistent user-agent
]);

/** Stands in for a numeric code when api.js itself never arrived. */
export const TURNSTILE_NETWORK_CODE = "network";

export function classifyTurnstileError(
  code: string | null | undefined,
): TurnstileFailure {
  if (!code) {
    return {
      code: TURNSTILE_NETWORK_CODE,
      kind: "network",
      operatorActionRequired: false,
    };
  }

  if (
    CONFIGURATION_CODES.has(code) ||
    code.startsWith(CONFIGURATION_CODE_PREFIX)
  ) {
    return { code, kind: "configuration", operatorActionRequired: true };
  }

  if (UNSUPPORTED_CODES.has(code)) {
    return { code, kind: "unsupported", operatorActionRequired: false };
  }

  return { code, kind: "retryable", operatorActionRequired: false };
}
