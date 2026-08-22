import { describe, expect, it, afterEach } from "vitest";
import { generateTOTP } from "@oslojs/otp";
import { decodeBase32 } from "@oslojs/encoding";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  isEncryptedTotpSecret,
  requireTotpEncryptionKey,
  TotpEncryptionKeyMissingError,
} from "./totp-crypto";
import { generateTotpSecret, verifyTotpCode } from "./totp";

// Deliberately low-entropy and repetitive. A test constant that looks like a
// real key forces gitleaks to tell fakes from the real thing, and a scanner
// making that judgement eventually errs in the permissive direction.
const KEY = "totp-test-key-".repeat(4);
const OTHER_KEY = "totp-other-key-".repeat(4);
const MEMBER = "11111111-1111-4111-8111-111111111111";
const OTHER_MEMBER = "22222222-2222-4222-8222-222222222222";

describe("security.md: staff TOTP seeds are encrypted at rest", () => {
  it("round-trips a seed for the member it was bound to", () => {
    const { secret } = generateTotpSecret();

    const stored = encryptTotpSecret(secret, MEMBER, KEY);

    expect(decryptTotpSecret(stored, MEMBER, KEY)).toBe(secret);
  });

  it("stores something that is not the seed", () => {
    const { secret } = generateTotpSecret();

    const stored = encryptTotpSecret(secret, MEMBER, KEY);

    // The regression this whole module exists to prevent: the column used to
    // hold exactly `secret`, so a database read was a working authenticator.
    expect(stored).not.toBe(secret);
    expect(stored).not.toContain(secret);
    expect(isEncryptedTotpSecret(stored)).toBe(true);
  });

  it("still verifies a real code after the round-trip", () => {
    // Encryption is worthless if it quietly corrupts the seed: the enrolment
    // would appear to succeed and every subsequent sign-in would fail. This is
    // the test that would catch that, because it drives the real TOTP
    // algorithm rather than only comparing strings.
    const { secret } = generateTotpSecret();
    const stored = encryptTotpSecret(secret, MEMBER, KEY);

    const recovered = decryptTotpSecret(stored, MEMBER, KEY);
    expect(recovered).not.toBeNull();

    const code = generateTOTP(decodeBase32(recovered!), 30, 6);

    expect(verifyTotpCode(recovered!, code)).toBe(true);
  });

  it("produces a different ciphertext each time, for the same seed", () => {
    const { secret } = generateTotpSecret();

    const first = encryptTotpSecret(secret, MEMBER, KEY);
    const second = encryptTotpSecret(secret, MEMBER, KEY);

    // A fresh IV per encryption. Without it, equal ciphertexts would reveal
    // which staff members share a seed - and reused IVs break GCM outright.
    expect(first).not.toBe(second);
    expect(decryptTotpSecret(second, MEMBER, KEY)).toBe(secret);
  });
});

describe("security.md: an unreadable seed refuses, it never degrades", () => {
  it("refuses a seed bound to a different member", () => {
    const { secret } = generateTotpSecret();
    const stored = encryptTotpSecret(secret, MEMBER, KEY);

    // An attacker who can write to the database must not be able to move one
    // staff member's authenticator onto another's account.
    expect(decryptTotpSecret(stored, OTHER_MEMBER, KEY)).toBeNull();
  });

  it("refuses a seed encrypted under a different key", () => {
    const { secret } = generateTotpSecret();
    const stored = encryptTotpSecret(secret, MEMBER, KEY);

    expect(decryptTotpSecret(stored, MEMBER, OTHER_KEY)).toBeNull();
  });

  it("refuses a tampered ciphertext", () => {
    const { secret } = generateTotpSecret();
    const stored = encryptTotpSecret(secret, MEMBER, KEY);

    const parts = stored.split(".");
    const body = Buffer.from(parts[2]!, "base64url");
    body[0] = body[0]! ^ 0xff;
    const tampered = [
      parts[0],
      parts[1],
      body.toString("base64url"),
      parts[3],
    ].join(".");

    expect(decryptTotpSecret(tampered, MEMBER, KEY)).toBeNull();
  });

  it("refuses a plaintext base32 seed left by the old code", () => {
    // The pre-fix column held values of exactly this shape. They must not
    // verify: they are compromised by definition, and the migration nulls
    // them, but a stray row must fail closed rather than authenticate.
    const { secret } = generateTotpSecret();

    expect(decryptTotpSecret(secret, MEMBER, KEY)).toBeNull();
    expect(isEncryptedTotpSecret(secret)).toBe(false);
  });

  it("refuses an absent, empty or malformed value", () => {
    expect(decryptTotpSecret(null, MEMBER, KEY)).toBeNull();
    expect(decryptTotpSecret(undefined, MEMBER, KEY)).toBeNull();
    expect(decryptTotpSecret("", MEMBER, KEY)).toBeNull();
    expect(decryptTotpSecret("totp_v1.only.three", MEMBER, KEY)).toBeNull();
    expect(decryptTotpSecret("totp_v2.a.b.c", MEMBER, KEY)).toBeNull();
  });
});

describe("security.md: a missing encryption key fails closed", () => {
  const original = process.env["TOTP_ENCRYPTION_KEY"];

  afterEach(() => {
    if (original === undefined) {
      delete process.env["TOTP_ENCRYPTION_KEY"];
    } else {
      process.env["TOTP_ENCRYPTION_KEY"] = original;
    }
  });

  it("throws rather than returning a usable default", () => {
    delete process.env["TOTP_ENCRYPTION_KEY"];

    // There is no safe fallback for a missing key. Returning null and letting
    // the caller decide is how the original bug happened.
    expect(() => requireTotpEncryptionKey()).toThrow(
      TotpEncryptionKeyMissingError,
    );
  });

  it("throws on an empty key", () => {
    process.env["TOTP_ENCRYPTION_KEY"] = "";

    expect(() => requireTotpEncryptionKey()).toThrow(
      TotpEncryptionKeyMissingError,
    );
  });

  it("returns the key when it is configured", () => {
    process.env["TOTP_ENCRYPTION_KEY"] = KEY;

    expect(requireTotpEncryptionKey()).toBe(KEY);
  });
});
