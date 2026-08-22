import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Encryption at rest for staff TOTP seeds.
 *
 * security.md §"Secret" promises that TOTP seeds are "hashed or encrypted" and
 * that "the database never holds a usable credential". A seed cannot be hashed
 * - verification needs the original bytes - so it must be encrypted, and until
 * this module existed the promise was simply untrue: `generateTotpSecret()`
 * base32-encoded the seed and the value went into a plain `text` column. Anyone
 * who could read the `members` table could mint valid codes for any staff
 * account, which is the exact scenario the second factor exists to survive.
 *
 * The ciphertext is bound to the member it belongs to via AES-GCM's additional
 * authenticated data. Copying staff A's stored value onto staff B's row - a
 * write an attacker with database access would otherwise find trivial - fails
 * to decrypt rather than granting B's account to A's authenticator.
 */

const VERSION = "totp_v1";
const KEY_INFO = "kclub.totp.encryption.v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * The key material is a passphrase of arbitrary shape rather than exactly 32
 * bytes, so it is stretched with HKDF instead of being used raw. Domain
 * separation matches the convention in lib/card-token.ts: a value used for two
 * purposes must never produce the same key for both.
 */
function deriveKey(keyMaterial: string): Buffer {
  return Buffer.from(hkdfSync("sha256", keyMaterial, "", KEY_INFO, 32));
}

export class TotpEncryptionKeyMissingError extends Error {
  constructor() {
    super(
      "TOTP_ENCRYPTION_KEY is not configured; refusing to handle a TOTP seed in plaintext",
    );
    this.name = "TotpEncryptionKeyMissingError";
  }
}

/**
 * Reads the key from the environment, failing closed.
 *
 * Returning a nullable key and letting callers decide would reproduce the bug
 * this module fixes: the previous code path had no key at all and silently
 * stored plaintext. There is no safe fallback, so there is no fallback.
 */
export function requireTotpEncryptionKey(): string {
  const key = process.env["TOTP_ENCRYPTION_KEY"];

  if (typeof key !== "string" || key.length === 0) {
    throw new TotpEncryptionKeyMissingError();
  }

  return key;
}

/**
 * Encrypts a base32 TOTP seed, binding it to `memberId`.
 *
 * The output is `totp_v1.<iv>.<ciphertext>.<tag>` in base64url. The version
 * prefix is what lets a later key rotation or algorithm change recognise, and
 * refuse, values it did not write.
 */
export function encryptTotpSecret(
  secret: string,
  memberId: string,
  keyMaterial: string,
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(keyMaterial), iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(memberId, "utf8"));

  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);

  return [
    VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

/**
 * Decrypts a stored seed, or returns null.
 *
 * Null covers every failure that is not a programming error: a value written
 * before this module existed (plaintext base32, which has no version prefix), a
 * value bound to a different member, a truncated value, and a tampered one.
 * Callers treat null as "this member has no usable second factor" and refuse
 * the sign-in, which is the safe direction - an unreadable seed must never
 * degrade into a skipped check.
 */
export function decryptTotpSecret(
  stored: string | null | undefined,
  memberId: string,
  keyMaterial: string,
): string | null {
  if (!stored) return null;

  const parts = stored.split(".");
  if (parts.length !== 4) return null;

  const [version, ivPart, ciphertextPart, tagPart] = parts as [
    string,
    string,
    string,
    string,
  ];

  // Compared in constant time out of habit rather than necessity: the version
  // is not secret, but this is the file where that habit should hold.
  const expected = Buffer.from(VERSION, "utf8");
  const actual = Buffer.from(version, "utf8");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const iv = Buffer.from(ivPart, "base64url");
    const tag = Buffer.from(tagPart, "base64url");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;

    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveKey(keyMaterial),
      iv,
      { authTagLength: TAG_BYTES },
    );
    decipher.setAAD(Buffer.from(memberId, "utf8"));
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // GCM authentication failure lands here. It is not distinguishable from,
    // and must not be reported differently to, a malformed value.
    return null;
  }
}

/**
 * Whether a stored value is in the encrypted envelope this module writes.
 *
 * Used by the constraint test that reads the column directly, so that a
 * regression storing plaintext again fails a test rather than shipping.
 */
export function isEncryptedTotpSecret(stored: string | null): boolean {
  return typeof stored === "string" && stored.startsWith(`${VERSION}.`);
}
