import { describe, expect, it } from "vitest";

import {
  DEFAULT_PHONE_COUNTRY,
  MAX_PHONE_INPUT_LENGTH,
  isValidPhone,
  phoneCountries,
  phoneExample,
  phoneLookupSchema,
  phoneSchema,
  toE164,
} from "./phone";

/**
 * FR-001: a member is registered from a phone number in E.164 form, and that
 * number is what identifies them.
 *
 * The defect this replaces: `members.phone` is unique and looked up with `=`,
 * while the three schemas that wrote to it accepted any string of 8..20
 * characters. Registering as `+380671234567` and signing in as
 * `+380 67 123 45 67` produced "invalid phone number or password", and the two
 * spellings could occupy two rows without the unique index noticing.
 */
describe("FR-001: phone numbers normalise to one E.164 form", () => {
  it("folds every spelling of one number onto the same identity", () => {
    const spellings = [
      "+380671234567",
      "+380 67 123 45 67",
      "+380 (67) 123-45-67",
      "  +380671234567  ",
    ];

    for (const spelling of spellings) {
      expect(phoneSchema.parse(spelling)).toBe("+380671234567");
    }
  });

  it("is idempotent, because register-flow posts the number back a second time", () => {
    const once = phoneSchema.parse("+380 67 123 45 67");
    expect(phoneSchema.parse(once)).toBe(once);
  });

  it("produces a value that fits members.phone (varchar 20)", () => {
    for (const number of [
      "+380671234567",
      "+12015550123",
      "+8613912345678",
      "+998901127705",
    ]) {
      expect(phoneSchema.parse(number).length).toBeLessThanOrEqual(20);
    }
  });

  it("reads a national number as the default country", () => {
    expect(DEFAULT_PHONE_COUNTRY).toBe("US");
    expect(phoneSchema.parse("(201) 555-0123")).toBe("+12015550123");
  });

  it("rejects input longer than the parser is willing to consider", () => {
    const tooLong = `+${"9".repeat(MAX_PHONE_INPUT_LENGTH + 1)}`;
    expect(phoneSchema.safeParse(tooLong).success).toBe(false);
  });
});

/**
 * FR-002: the number is verified by a 6-digit code delivered by SMS, so a
 * number that cannot receive one cannot become an identity. `mobile` metadata
 * is what makes "valid" mean "reachable by SMS".
 */
describe("FR-002: only numbers that can receive an SMS are accepted", () => {
  it("accepts a mobile number", () => {
    expect(isValidPhone("+380671234567")).toBe(true);
  });

  it("rejects a landline where the numbering plan separates the two", () => {
    // +380 44 … is Kyiv fixed-line. The `min` metadata set calls this valid;
    // that is the reason this module does not use it.
    expect(isValidPhone("+380442345678")).toBe(false);
    expect(phoneSchema.safeParse("+380442345678").success).toBe(false);
  });

  it("accepts US numbers, whose ranges cannot distinguish the two", () => {
    expect(isValidPhone("+12015550123")).toBe(true);
  });

  it("rejects a number of the wrong length for its country", () => {
    expect(phoneSchema.safeParse("+38067123456").success).toBe(false);
  });

  it("rejects text that is not a phone number", () => {
    for (const input of ["", "   ", "not a phone", "+", "12"]) {
      expect(phoneSchema.safeParse(input).success).toBe(false);
    }
  });

  it("reports the failure as a message the form can show", () => {
    const result = phoneSchema.safeParse("+380442345678");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Enter a mobile number in international format",
      );
    }
  });
});

/**
 * FR-005: a returning member signs in with phone plus password. Sign-in looks a
 * number up, it does not claim one, so it normalises without validating —
 * otherwise every row written before normalisation becomes unreachable.
 */
describe("FR-005: sign-in normalises without rejecting", () => {
  it("normalises a well-formed number the same way registration did", () => {
    expect(phoneLookupSchema.parse("+380 67 123 45 67")).toBe("+380671234567");
  });

  it("still reaches a well-formed number that is not a real mobile", () => {
    // The seeded staff owner. Sign-in must find this row; registration must
    // never have created it, and after this change could not.
    expect(phoneLookupSchema.parse("+380000000000")).toBe("+380000000000");
    expect(phoneSchema.safeParse("+380000000000").success).toBe(false);
  });

  it("passes unparseable input through rather than throwing", () => {
    expect(phoneLookupSchema.parse("not a phone")).toBe("not a phone");
  });

  it("is bounded like every other trust boundary", () => {
    const tooLong = "9".repeat(MAX_PHONE_INPUT_LENGTH + 1);
    expect(phoneLookupSchema.safeParse(tooLong).success).toBe(false);
  });
});

/**
 * The picker's data. `+380 XX XXX XX XX` used to be hard-coded as the
 * placeholder in all three locales, which was wrong for every member outside
 * Ukraine and is the reason the phone-change form needed a hint string.
 */
describe("phone input options", () => {
  it("offers a real example number in the country's own national form", () => {
    expect(phoneExample("UA")).toBe("050 123 4567");
    expect(phoneExample("US")).toBe("(201) 555-0123");
    expect(phoneExample("PL")).toBe("512 345 678");
  });

  it("produces an example that survives its own validation", () => {
    for (const country of ["UA", "US", "PL", "DE", "GB"] as const) {
      expect(isValidPhone(phoneExample(country), country)).toBe(true);
    }
  });

  it("lists countries with a flag and a dialling code", () => {
    const countries = phoneCountries("en");
    const ukraine = countries.find((c) => c.code === "UA");

    expect(ukraine).toEqual({
      code: "UA",
      name: "Ukraine",
      flag: "🇺🇦",
      callingCode: "380",
    });
  });

  it("names each country in the requested locale", () => {
    const name = (locale: "en" | "ru" | "uk") =>
      phoneCountries(locale).find((c) => c.code === "UA")?.name;

    expect(name("en")).toBe("Ukraine");
    expect(name("ru")).not.toBe(name("en"));
    expect(name("uk")).not.toBe(name("en"));
  });

  it("offers only countries the metadata can validate", () => {
    const countries = phoneCountries("en");

    expect(countries.length).toBeGreaterThan(200);
    for (const country of countries) {
      expect(country.callingCode).toMatch(/^\d+$/);
      expect(country.flag).not.toBe("");
    }
  });
});

describe("toE164", () => {
  it("returns null for input that is not a phone number at all", () => {
    expect(toE164("not a phone")).toBeNull();
  });

  it("honours an explicit country for a national number", () => {
    expect(toE164("067 123 45 67", "UA")).toBe("+380671234567");
  });
});
