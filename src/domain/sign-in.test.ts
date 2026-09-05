import { describe, expect, it } from "vitest";

import { refuseSignIn } from "./sign-in";
import { readLoginIdentifier } from "@/lib/login-identifier";

const active = { status: "active", emailVerifiedAt: null };
const verified = { status: "active", emailVerifiedAt: new Date() };

/**
 * Signing in with either identifier (FR-005, ADR 0032).
 *
 * The case that matters is the third one: an address that has been claimed but
 * never proved must not sign anyone in. Without it, typing somebody else's
 * address into the settings panel would be enough to take their account — the
 * claim is unauthenticated by design, and only the emailed link authenticates
 * it.
 */
describe("sign-in eligibility (FR-005, ADR 0032)", () => {
  it("FR-005: a phone sign-in does not care about the email column", () => {
    expect(refuseSignIn("phone", active)).toBeNull();
    expect(refuseSignIn("phone", verified)).toBeNull();
  });

  it("FR-005: a verified address may sign in", () => {
    expect(refuseSignIn("email", verified)).toBeNull();
  });

  it("FR-005: an unproved address may not, and is refused as bad credentials", () => {
    // Not its own error: a distinct answer would confirm to an anonymous
    // caller that the address is registered (security.md §6).
    expect(refuseSignIn("email", active)).toBe("invalid_credentials");
  });

  it("FR-010: a blocked member is refused whichever identifier they use", () => {
    for (const kind of ["phone", "email"] as const) {
      expect(refuseSignIn(kind, { ...verified, status: "blocked" })).toBe(
        "not_active",
      );
      expect(
        refuseSignIn(kind, { ...verified, status: "pending_deletion" }),
      ).toBe("not_active");
    }
  });

  it("FR-010: blocked outranks unproved, so the answer never leaks the block", () => {
    // Both rules apply to this row. The order is deliberate only in that it is
    // stable; what matters is that one answer comes out.
    expect(
      refuseSignIn("email", { status: "blocked", emailVerifiedAt: null }),
    ).toBe("not_active");
  });
});

describe("reading the identifier off the form (FR-005)", () => {
  it("takes the phone when the phone tab was used", () => {
    expect(readLoginIdentifier({ phone: "+380501234567" })).toEqual({
      kind: "phone",
      value: "+380501234567",
    });
  });

  it("takes the address when the email tab was used", () => {
    expect(readLoginIdentifier({ email: "jane@example.com" })).toEqual({
      kind: "email",
      value: "jane@example.com",
    });
  });

  it("refuses to guess when neither arrived", () => {
    expect(readLoginIdentifier({})).toBeNull();
    expect(readLoginIdentifier({ phone: "", email: "" })).toBeNull();
  });

  it("picks one rather than erroring when a caller sends both", () => {
    // The form mounts exactly one field, so this request is not one of ours.
    expect(
      readLoginIdentifier({ phone: "+380501234567", email: "j@example.com" }),
    ).toEqual({ kind: "email", value: "j@example.com" });
  });
});
