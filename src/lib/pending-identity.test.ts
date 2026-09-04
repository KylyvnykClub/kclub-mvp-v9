import { describe, expect, it } from "vitest";

import {
  openPendingIdentity,
  sealPendingIdentity,
  type PendingIdentity,
} from "./pending-identity";

const SECRET = "test-secret-for-pending-identity";

const identity: PendingIdentity = {
  provider: "google",
  subject: "1234567890",
  email: "jane@example.com",
  displayName: "Jane",
  expiresAt: Date.now() + 60_000,
};

/**
 * The cookie that carries "Google vouched for this address" to the
 * registration form (ADR 0029).
 *
 * Everything here is the same attack in different clothes: the browser holds
 * this cookie, so if it can be edited, anyone can register with an address
 * they do not own and have it marked verified — which is exactly the proof
 * the password reset then trusts.
 */
describe("pending Google identity (ADR 0029)", () => {
  it("round-trips what was sealed", () => {
    const opened = openPendingIdentity(
      sealPendingIdentity(identity, SECRET),
      SECRET,
    );

    expect(opened).toEqual(identity);
  });

  it("ADR 0029: refuses an edited payload", () => {
    const sealed = sealPendingIdentity(identity, SECRET);
    const [, signature] = sealed.split(".");

    const forged = Buffer.from(
      JSON.stringify({ ...identity, email: "attacker@example.com" }),
      "utf8",
    ).toString("base64url");

    expect(openPendingIdentity(`${forged}.${signature}`, SECRET)).toBeNull();
  });

  it("ADR 0029: refuses a signature made with another secret", () => {
    const sealed = sealPendingIdentity(identity, "some-other-secret");

    expect(openPendingIdentity(sealed, SECRET)).toBeNull();
  });

  it("ADR 0029: refuses one that has expired", () => {
    const sealed = sealPendingIdentity(identity, SECRET);

    expect(
      openPendingIdentity(sealed, SECRET, identity.expiresAt + 1),
    ).toBeNull();
  });

  it("refuses the malformed without throwing", () => {
    // A signature of a different length would make a naive timing-safe
    // comparison throw, which is a louder answer for one forgery than another.
    for (const bad of [
      undefined,
      "",
      "nodot",
      "a.b",
      ".",
      `${"x".repeat(40)}.${"y".repeat(43)}`,
    ]) {
      expect(openPendingIdentity(bad, SECRET)).toBeNull();
    }
  });
});
