import { describe, expect, it } from "vitest";

import {
  registerErrorField,
  registerFieldAt,
  type RegisterErrorCode,
} from "./registration";

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
    "throttled",
    "failed",
  ] satisfies RegisterErrorCode[])(
    "FR-001: %s belongs to the form, not to one field",
    (code) => {
      expect(registerErrorField(code)).toBeNull();
    },
  );
});

describe("registration refusals name the field they are about", () => {
  it("names the country, name and password as well as phone and email", () => {
    expect(registerFieldAt(["country"])).toBe("country");
    expect(registerFieldAt(["displayName"])).toBe("displayName");
    expect(registerFieldAt(["password"])).toBe("password");
    expect(registerFieldAt(["phone"])).toBe("phone");
  });

  it("names nothing for a path that is not a form field", () => {
    expect(registerFieldAt(["consents", 0])).toBeNull();
    expect(registerFieldAt([])).toBeNull();
    expect(registerFieldAt(undefined)).toBeNull();
  });
});
