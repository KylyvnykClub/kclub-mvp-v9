import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";

/**
 * Hashes a password using Argon2id.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  });
}

/**
 * Verifies a password against a hash.
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * Generates a cryptographically secure random token.
 * Defaults to 32 bytes (64 hex characters), used for session tokens.
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}
