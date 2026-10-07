import { describe, expect, it } from "vitest";

import { analyticsAllowedOn, parseConsent } from "./analytics-consent";

describe("ADR 0045: Google Tag Manager only where, and only when, it may run", () => {
  it.each([
    "/uk",
    "/en/",
    "/ru/pricing",
    "/uk/directory/acme",
    "/en/legal/terms-of-use",
  ])("may load on the public page %s", (path) => {
    expect(analyticsAllowedOn(path)).toBe(true);
  });

  it.each([
    "/uk/dashboard/profile",
    "/en/dashboard/admin/members",
    "/ru/membership",
    "/uk/register",
    "/uk/login",
    "/en/partner",
    "/uk/card/abc",
    "/uk/join/secret",
    "/uk/r/code",
    "/en/reset-password/token",
  ])("never loads on %s", (path) => {
    expect(analyticsAllowedOn(path)).toBe(false);
  });

  it("reads only the two choices it writes", () => {
    expect(parseConsent("granted")).toBe("granted");
    expect(parseConsent("denied")).toBe("denied");
    expect(parseConsent("yes")).toBeNull();
    expect(parseConsent(undefined)).toBeNull();
  });
});
