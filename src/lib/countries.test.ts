import { describe, expect, it } from "vitest";

import { countryFlag, countryName, countryOptions } from "@/lib/countries";

describe("countryName", () => {
  it("names a region in the requested locale", () => {
    expect(countryName("US", "en")).toBe("United States");
    expect(countryName("UA", "uk")).toBe("Україна");
  });

  it("names a lowercase code, which arrives from stored data", () => {
    expect(countryName("us", "en")).toBe("United States");
  });

  it("returns free text unchanged rather than throwing", () => {
    // `companies.country` is a varchar(100), so a row may hold a name rather
    // than a code. `Intl.DisplayNames.of` answers that with a RangeError, and
    // a client component that throws renders the blank "Application error"
    // page instead of a catalogue.
    expect(countryName("Poland", "en")).toBe("Poland");
    expect(countryName("", "en")).toBe("");
    expect(countryName("USA", "en")).toBe("USA");
  });

  it("lets ICU name an unassigned code, which it does rather than throwing", () => {
    // Not a claim about "ZZ" being desirable - it records that a well-shaped
    // but unassigned code takes the Intl path and cannot reach the catch.
    expect(countryName("ZZ", "en")).toBe("Unknown Region");
  });
});

describe("countryOptions", () => {
  it("sorts by the localized name, not by the code", () => {
    const names = countryOptions("en").map((o) => o.name);

    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("names every code it offers", () => {
    const unnamed = countryOptions("ru").filter((o) => o.name === o.code);

    expect(unnamed).toEqual([]);
  });
});

describe("countryFlag", () => {
  it("maps a code to its regional-indicator pair", () => {
    expect(countryFlag("ua")).toBe("🇺🇦");
    expect(countryFlag("US")).toBe("🇺🇸");
  });

  it("returns nothing for anything that is not a two-letter code", () => {
    expect(countryFlag("USA")).toBe("");
    expect(countryFlag("")).toBe("");
  });
});
