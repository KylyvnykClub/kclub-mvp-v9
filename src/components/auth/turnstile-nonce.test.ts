import { describe, expect, it } from "vitest";

import { nextChallengeNonce } from "./turnstile-nonce";

describe("FR-112: a refused attempt is given a fresh challenge, never the spent one", () => {
  it("issues a fresh challenge after a refused attempt", () => {
    expect(nextChallengeNonce(0, { success: false })).toBe(1);
  });

  it("issues a fresh challenge after every refusal, not only the first", () => {
    let nonce = 0;
    for (const _ of [1, 2, 3]) {
      nonce = nextChallengeNonce(nonce, { success: false });
    }
    expect(nonce).toBe(3);
  });

  it("leaves the challenge alone before anything has been submitted", () => {
    expect(nextChallengeNonce(0, null)).toBe(0);
  });

  it("leaves the challenge alone on success, because the form is leaving", () => {
    expect(nextChallengeNonce(4, { success: true })).toBe(4);
  });
});
