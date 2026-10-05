import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * "This browser opened a member's invite link", carried to the registration
 * form in a cookie the browser cannot forge (ADR 0042).
 *
 * The join link's seal (`pending-join.ts`) with its own key, so one can never
 * be passed off as the other. It carries the link's id, never its code, and
 * the link is read again at submit time: rotating has to mean rotated now.
 */

export interface PendingInvite {
  inviteLinkId: string;
  /** Epoch millis after which this is refused. */
  expiresAt: number;
}

/**
 * A week, not half an hour: an invite is passed on in a message and acted on
 * later, and whoever opened it may register a day after.
 */
export const PENDING_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const PENDING_INVITE_COOKIE = "pending_invite";

function sign(payload: string, secret: string): string {
  return createHmac("sha256", `kclub.pending-invite.v1.${secret}`)
    .update(payload)
    .digest("base64url");
}

export function sealPendingInvite(
  invite: PendingInvite,
  secret: string,
): string {
  const payload = Buffer.from(JSON.stringify(invite), "utf8").toString(
    "base64url",
  );

  return `${payload}.${sign(payload, secret)}`;
}

/** The invite only if the signature matches and it has not expired. */
export function openPendingInvite(
  sealed: string | undefined,
  secret: string,
  now: number = Date.now(),
): PendingInvite | null {
  if (!sealed) return null;

  const [payload, signature] = sealed.split(".");
  if (!payload || !signature) return null;

  const given = Buffer.from(signature);
  const wanted = Buffer.from(sign(payload, secret));

  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return null;
  }

  try {
    const invite = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as PendingInvite;

    if (typeof invite.expiresAt !== "number" || invite.expiresAt <= now) {
      return null;
    }

    return typeof invite.inviteLinkId === "string" && invite.inviteLinkId
      ? invite
      : null;
  } catch {
    return null;
  }
}
