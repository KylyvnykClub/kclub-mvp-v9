import { describe, expect, it } from "vitest";
import { hashSessionToken } from "./session-token";

describe("hashSessionToken", () => {
  it("derives a deterministic non-reversible lookup value", () => {
    const token = "session-token";

    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toBe(token);
    expect(hashSessionToken(token)).toHaveLength(64);
  });

  it("separates tokens through a domain-specific namespace", () => {
    expect(hashSessionToken("one")).not.toBe(hashSessionToken("two"));
  });
});
