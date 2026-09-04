import { describe, expect, it } from "vitest";

import { readGoogleIdentity } from "./google-claims";

/** Builds an unsigned JWT shape, which is all `decodeIdToken` reads. */
function idToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

  return `${part({ alg: "RS256" })}.${part(claims)}.signature`;
}

/**
 * Reading a Google `id_token` (ADR 0029).
 *
 * `email_verified` is the claim the whole flow rests on: without it, anyone
 * could put a stranger's address on a Google account and sign in as them here.
 * Google sends it as a boolean, and has historically sent it as a string, so
 * both are accepted — and everything else is treated as "no".
 */
describe("google identity claims (ADR 0029)", () => {
  it("reads the subject, address and name", () => {
    const identity = readGoogleIdentity(
      idToken({
        sub: "108",
        email: "Jane@Example.COM",
        email_verified: true,
        name: "Jane Doe",
      }),
    );

    expect(identity).toEqual({
      subject: "108",
      // Lowercased here too, because it is compared with `members.email`.
      email: "jane@example.com",
      emailVerified: true,
      displayName: "Jane Doe",
    });
  });

  it("ADR 0029: accepts the string form of email_verified Google still sends", () => {
    const identity = readGoogleIdentity(
      idToken({ sub: "1", email: "a@b.com", email_verified: "true" }),
    );

    expect(identity?.emailVerified).toBe(true);
  });

  it("ADR 0029: treats anything else as unverified", () => {
    for (const value of [false, "false", "yes", 1, null, undefined]) {
      const identity = readGoogleIdentity(
        idToken({ sub: "1", email: "a@b.com", email_verified: value }),
      );

      expect(identity?.emailVerified).toBe(false);
    }
  });

  it("returns null when the claims name no subject or no address", () => {
    expect(readGoogleIdentity(idToken({ email: "a@b.com" }))).toBeNull();
    expect(readGoogleIdentity(idToken({ sub: "1" }))).toBeNull();
  });

  it("carries no display name rather than inventing one", () => {
    const identity = readGoogleIdentity(
      idToken({ sub: "1", email: "a@b.com", email_verified: true }),
    );

    expect(identity?.displayName).toBeNull();
  });
});
