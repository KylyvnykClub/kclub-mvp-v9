import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/identity/google", () => ({
  GOOGLE_SCOPES: ["openid", "email", "profile"],
  googleEnabled: () => Promise.resolve(true),
  googleProvider: () => ({
    createAuthorizationURL: () =>
      new URL("https://accounts.google.test/o/oauth2/auth"),
  }),
}));

import { GET } from "./route";

/**
 * ADR 0043 / FR-103: a VIP chosen before signing up must reach the dues
 * screen. Through Google the choice crosses two redirects, and the only thing
 * that carries it is the cookie this route sets.
 */
describe("ADR 0043: Google sign-up keeps the chosen plan", () => {
  it("FR-103: remembers plan=vip for the callback", async () => {
    const response = await GET(
      new NextRequest(
        "https://club.test/api/auth/google/start?locale=uk&plan=vip",
      ),
    );

    expect(response.cookies.get("google_oauth_plan")?.value).toBe("vip");
    expect(response.cookies.get("google_oauth_locale")?.value).toBe("uk");
  });

  it("FR-103: anything but vip is the default plan", async () => {
    const response = await GET(
      new NextRequest(
        "https://club.test/api/auth/google/start?locale=en&plan=gold",
      ),
    );

    expect(response.cookies.get("google_oauth_plan")?.value).toBe("");
  });
});
