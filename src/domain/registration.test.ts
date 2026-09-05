import { describe, expect, it } from "vitest";

import { registerErrorField, type RegisterErrorCode } from "./registration";

describe("FR-001: a refusal knows which box it belongs against (ADR 0032)", () => {
  it("FR-001: puts a taken address against the address field", () => {
    expect(registerErrorField("email_taken")).toBe("email");
  });

  it("FR-001: puts a taken number against the number field (ADR 0030)", () => {
    expect(registerErrorField("phone_taken")).toBe("phone");
  });

  it.each([
    "invalid_input",
    "consents_required",
    "consents_stale",
    "challenge",
    "challenge_unavailable",
    "code_invalid",
    "failed",
  ] satisfies RegisterErrorCode[])(
    "FR-001: %s belongs to the form, not to one field",
    (code) => {
      expect(registerErrorField(code)).toBeNull();
    },
  );
});
