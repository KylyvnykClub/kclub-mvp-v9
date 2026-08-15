import { describe, expect, it } from "vitest";

import {
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_COOKIE_NAME,
  isSupportedLocale,
  localeCookieOptions,
} from "./locale-cookie";
import { routing } from "@/i18n/routing";

/**
 * FR-091: the locale comes from the member's saved preference first, then the
 * browser's Accept-Language, then English.
 *
 * next-intl owns the last two. The first is this cookie, which the middleware
 * reads ahead of Accept-Language - so the name and options here have to keep
 * matching what next-intl expects, and that agreement is what these assert.
 */

describe("FR-091: the saved language preference becomes the locale", () => {
  it("writes the cookie next-intl reads", () => {
    expect(LOCALE_COOKIE_NAME).toBe("NEXT_LOCALE");
    expect(routing.localeCookie).toMatchObject({ name: LOCALE_COOKIE_NAME });
  });

  it("agrees with next-intl on sameSite, or the middleware would not see it", () => {
    const options = localeCookieOptions("ru");

    expect(options?.sameSite).toBe("lax");
    expect(routing.localeCookie).toMatchObject({ sameSite: "lax" });
  });

  it("accepts every locale the product publishes", () => {
    for (const locale of routing.locales) {
      expect(isSupportedLocale(locale)).toBe(true);
      expect(localeCookieOptions(locale)?.value).toBe(locale);
    }
  });

  it("refuses a language the product does not publish", () => {
    expect(localeCookieOptions("de")).toBeNull();
    expect(localeCookieOptions("")).toBeNull();
  });

  it("refuses anything that is not a string, so a stored null is not written back", () => {
    expect(localeCookieOptions(null)).toBeNull();
    expect(localeCookieOptions(undefined)).toBeNull();
    expect(localeCookieOptions(42)).toBeNull();
  });

  it("outlives a session, because a stated preference is not a session choice", () => {
    expect(LOCALE_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 365);
    expect(localeCookieOptions("uk")?.maxAge).toBe(LOCALE_COOKIE_MAX_AGE);
  });

  it("applies to the whole site, not to the path it was set from", () => {
    expect(localeCookieOptions("en")?.path).toBe("/");
  });

  it("keeps English as the last resort", () => {
    expect(routing.defaultLocale).toBe("en");
  });

  it("leaves Accept-Language negotiation switched on for guests", () => {
    // A guest has no saved preference and no cookie; the browser decides.
    expect(routing.localeDetection).not.toBe(false);
  });
});
