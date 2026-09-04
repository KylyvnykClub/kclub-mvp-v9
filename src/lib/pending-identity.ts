import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A Google identity carried from the callback to the registration form, in a
 * cookie the browser cannot forge (ADR 0029).
 *
 * Google can prove who someone is, but it cannot supply a phone number, and a
 * phone number is still mandatory (ADR 0028). So a first-time visitor arrives
 * at registration with their address already proved and the rest still to
 * fill in, and something has to carry "Google vouched for this address"
 * across that redirect.
 *
 * A signed cookie rather than a database row: nothing here is worth a table,
 * and a row would need its own expiry sweep. A cookie rather than a query
 * parameter, because a query parameter ends up in the browser history and in
 * every referrer header the registration page sends.
 *
 * The signature is what makes it safe. Without it the browser could simply
 * claim any address was Google-verified and register with somebody else's.
 */

export interface PendingIdentity {
  provider: "google";
  subject: string;
  email: string;
  displayName: string | null;
  /** Epoch millis after which this is refused. */
  expiresAt: number;
}

/** Long enough to fill a registration form, short enough not to linger. */
export const PENDING_IDENTITY_TTL_MS = 30 * 60 * 1000;

export const PENDING_IDENTITY_COOKIE = "pending_identity";

function sign(payload: string, secret: string): string {
  return createHmac("sha256", `kclub.pending-identity.v1.${secret}`)
    .update(payload)
    .digest("base64url");
}

export function sealPendingIdentity(
  identity: PendingIdentity,
  secret: string,
): string {
  const payload = Buffer.from(JSON.stringify(identity), "utf8").toString(
    "base64url",
  );

  return `${payload}.${sign(payload, secret)}`;
}

/**
 * Returns the identity only if the signature matches and it has not expired.
 * Every other outcome — tampered, truncated, stale, not JSON — is `null`, and
 * the caller treats all of them the same way: as no identity at all.
 */
export function openPendingIdentity(
  sealed: string | undefined,
  secret: string,
  now: number = Date.now(),
): PendingIdentity | null {
  if (!sealed) return null;

  const [payload, signature] = sealed.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload, secret);
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);

  // Length-checked first: timingSafeEqual throws on a length mismatch, and a
  // throw here would be a louder answer for a wrong-length forgery than for a
  // right-length one.
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return null;
  }

  try {
    const identity = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as PendingIdentity;

    if (typeof identity.expiresAt !== "number" || identity.expiresAt <= now) {
      return null;
    }

    return identity.provider === "google" && identity.subject && identity.email
      ? identity
      : null;
  } catch {
    return null;
  }
}
