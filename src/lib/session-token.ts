import { createHash } from "node:crypto";

/**
 * Derives a stable lookup hash for bearer session tokens.
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(`kclub.session.v1.${token}`).digest("hex");
}
