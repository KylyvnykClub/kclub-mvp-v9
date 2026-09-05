import { describe, expect, it } from "vitest";

import { registerSchema } from "./registration-schema";

const complete = {
  phone: "+380671234567",
  email: "Jane@Example.COM",
  password: "correct horse battery",
  displayName: "Jane",
  country: "US",
  language: "en",
  consents: [{ documentId: "terms-of-use", version: "1.0" }],
};

describe("FR-001: registration needs both identifiers (ADR 0032)", () => {
  it("FR-001: accepts a registration carrying a phone number and an address", () => {
    const parsed = registerSchema.safeParse(complete);

    expect(parsed.success).toBe(true);
  });

  it("FR-001: refuses a registration with no email address", () => {
    const { email: _omitted, ...withoutEmail } = complete;

    const parsed = registerSchema.safeParse(withoutEmail);

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["email"]);
  });

  it("FR-001: refuses an empty email address, which is what an unfilled field posts", () => {
    const parsed = registerSchema.safeParse({ ...complete, email: "" });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["email"]);
  });

  it("FR-001: refuses something that is not an address", () => {
    const parsed = registerSchema.safeParse({ ...complete, email: "jane" });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["email"]);
  });

  it("FR-001: refuses a registration with no phone number", () => {
    const { phone: _omitted, ...withoutPhone } = complete;

    const parsed = registerSchema.safeParse(withoutPhone);

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["phone"]);
  });

  it("FR-001: stores the address lowercased, so one mailbox cannot become two rows", () => {
    const parsed = registerSchema.safeParse(complete);

    expect(parsed.data?.email).toBe("jane@example.com");
  });

  it("FR-001: still treats the SMS code as optional, because ADR 0012 postponed it", () => {
    const parsed = registerSchema.safeParse(complete);

    expect(parsed.success).toBe(true);
    expect(parsed.data?.code).toBeUndefined();
  });
});
