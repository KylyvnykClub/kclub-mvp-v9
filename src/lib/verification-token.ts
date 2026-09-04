import { createHash } from "node:crypto";

/**
 * Derives the lookup hash for a single-use verification link (ADR 0028).
 *
 * Same shape as `hashSessionToken`, with its own domain prefix so a token
 * issued for one purpose can never be presented as the other: the two hash
 * spaces do not overlap even if the same random bytes were somehow drawn
 * twice.
 */
export function hashVerificationToken(token: string): string {
  return createHash("sha256")
    .update(`kclub.verification.v1.${token}`)
    .digest("hex");
}
