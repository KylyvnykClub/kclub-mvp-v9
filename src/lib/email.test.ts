import { describe, expect, it } from "vitest";

import { emailLookupSchema, emailSchema, maskEmail } from "./email";

/**
 * `members.email` is unique and compared with `=` (ADR 0028), so the shape of
 * an address has to be decided in one place. These are the cases that would
 * otherwise hand one mailbox two accounts, or leave a member unable to sign in
 * with the address they typed at registration.
 */
describe("email normalisation (FR-001, ADR 0028)", () => {
  it("FR-001: lowercases, so one mailbox cannot hold two accounts", () => {
    expect(emailSchema.parse("Jane.Doe@Example.COM")).toBe(
      "jane.doe@example.com",
    );
  });

  it("FR-001: trims what a paste brings with it", () => {
    expect(emailSchema.parse("  jane@example.com \n")).toBe("jane@example.com");
  });

  it("FR-001: keeps dots and plus tags, because the link is sent there", () => {
    expect(emailSchema.parse("jane.doe+club@gmail.com")).toBe(
      "jane.doe+club@gmail.com",
    );
  });

  it("FR-001: refuses what is not an address", () => {
    for (const bad of [
      "",
      "jane",
      "jane@",
      "@example.com",
      "jane example.com",
    ]) {
      expect(emailSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("FR-001: refuses an address longer than the column", () => {
    const tooLong = `${"a".repeat(250)}@example.com`;
    expect(emailSchema.safeParse(tooLong).success).toBe(false);
  });

  it("FR-005: the lookup schema normalises without judging", () => {
    // Sign-in must answer the same way for a malformed address as for one
    // nobody holds (security.md §6), so looking one up cannot reject first.
    expect(emailLookupSchema.parse(" NOT-AN-ADDRESS ")).toBe("not-an-address");
  });
});

describe("email masking (ADR 0005)", () => {
  it("keeps the first and last character of the local part", () => {
    expect(maskEmail("jane.doe@example.com")).toBe("j••••••e@example.com");
  });

  it("hides a short local part entirely", () => {
    expect(maskEmail("jo@example.com")).toBe("j•••@example.com");
  });

  it("leaves a string with no domain alone rather than inventing one", () => {
    expect(maskEmail("broken")).toBe("broken");
  });
});
