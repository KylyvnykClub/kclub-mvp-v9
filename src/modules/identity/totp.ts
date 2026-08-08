import { createTOTPKeyURI, verifyTOTPWithGracePeriod } from "@oslojs/otp";
import { encodeBase32NoPadding, decodeBase32 } from "@oslojs/encoding";
import { randomBytes } from "node:crypto";

export function generateTotpSecret(): { secret: string; uri: string } {
  // Generate a 20-byte cryptographically secure random key
  const key = new Uint8Array(randomBytes(20));

  // Create TOTP URI for QR code generation
  // Using 30s period, 6 digits
  const uri = createTOTPKeyURI("Kylyvnyk Club", "Admin", key, 30, 6);

  // We'll store the secret in base32 format in the database
  const secret = encodeBase32NoPadding(key);

  return { secret, uri };
}

export function verifyTotpCode(secret: string, code: string): boolean {
  try {
    const key = decodeBase32(secret);

    // We allow a 30 second grace period (1 window before and after)
    return verifyTOTPWithGracePeriod(key, 30, 6, code, 30);
  } catch {
    return false;
  }
}
