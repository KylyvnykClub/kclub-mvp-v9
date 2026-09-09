import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * "This browser opened the club's join link", carried from the link to the
 * registration form in a cookie the browser cannot forge (ADR 0033).
 *
 * The same shape and the same reasoning as `pending-identity.ts`: the secret
 * must not be trusted at submit time, because a query parameter travels into
 * the browser history and into every referrer header the registration page
 * sends, and a hidden form field is simply whatever the client typed. The link
 * is opened, the server checks the secret against `join_links` once, and what
 * survives to the Server Action is a signed statement that it did.
 *
 * The seal deliberately carries the link's **id**, not its secret: the id is
 * useless to anyone who steals the cookie, and it records which door a member
 * came through without ever putting the door key in a second place.
 */

export interface PendingJoin {
  joinLinkId: string;
  /** Epoch millis after which this is refused. */
  expiresAt: number;
}

/** Long enough to fill a registration form, short enough not to linger. */
export const PENDING_JOIN_TTL_MS = 30 * 60 * 1000;

export const PENDING_JOIN_COOKIE = "pending_join";

function sign(payload: string, secret: string): string {
  return createHmac("sha256", `kclub.pending-join.v1.${secret}`)
    .update(payload)
    .digest("base64url");
}

export function sealPendingJoin(join: PendingJoin, secret: string): string {
  const payload = Buffer.from(JSON.stringify(join), "utf8").toString(
    "base64url",
  );

  return `${payload}.${sign(payload, secret)}`;
}

/**
 * The join only if the signature matches and it has not expired. Every other
 * outcome — tampered, truncated, stale, not JSON — is `null`, and the caller
 * treats all of them identically: as an ordinary registration that pays dues.
 */
export function openPendingJoin(
  sealed: string | undefined,
  secret: string,
  now: number = Date.now(),
): PendingJoin | null {
  if (!sealed) return null;

  const [payload, signature] = sealed.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload, secret);
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);

  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return null;
  }

  try {
    const join = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as PendingJoin;

    if (typeof join.expiresAt !== "number" || join.expiresAt <= now) {
      return null;
    }

    return typeof join.joinLinkId === "string" && join.joinLinkId ? join : null;
  } catch {
    return null;
  }
}
