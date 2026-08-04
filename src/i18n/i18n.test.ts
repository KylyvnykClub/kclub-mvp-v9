import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { IntlMessageFormat } from "intl-messageformat";

const LOCALES = ["en", "ru", "uk"] as const;
const MESSAGES_DIR = resolve(import.meta.dirname, "../../messages");

function flattenKeys(
  obj: Record<string, unknown>,
  prefix = "",
): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      for (const [k, v] of flattenKeys(
        value as Record<string, unknown>,
        full,
      )) {
        result.set(k, v);
      }
    } else {
      result.set(full, String(value));
    }
  }
  return result;
}

function loadMessages(locale: string): Map<string, string> {
  const path = resolve(MESSAGES_DIR, `${locale}.json`);
  const raw = readFileSync(path, "utf-8");
  return flattenKeys(JSON.parse(raw) as Record<string, unknown>);
}

describe("i18n: localisation completeness (testing.md §4)", () => {
  const allKeys = new Set<string>();
  const perLocale = new Map<string, Map<string, string>>();

  for (const locale of LOCALES) {
    const keys = loadMessages(locale);
    perLocale.set(locale, keys);
    for (const key of keys.keys()) {
      allKeys.add(key);
    }
  }

  it("all locales have the same set of keys", () => {
    const errors: string[] = [];
    for (const key of [...allKeys].sort()) {
      for (const locale of LOCALES) {
        if (!perLocale.get(locale)!.has(key)) {
          errors.push(`${locale} missing: ${key}`);
        }
      }
    }
    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  it("message files are valid JSON with no empty values", () => {
    for (const locale of LOCALES) {
      const messages = perLocale.get(locale)!;
      for (const [key, value] of messages) {
        expect(
          value.trim().length,
          `${locale}.${key} is empty`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe("i18n: ICU plural categories (ux.md §9)", () => {
  it("Russian plurals use one/few/many/other categories", () => {
    const ru = loadMessages("ru");
    const partnersMsg = ru.get("common.partners")!;

    const fmt = new IntlMessageFormat(partnersMsg, "ru");
    expect(fmt.format({ count: 0 })).toBe("нет партнёров");
    expect(fmt.format({ count: 1 })).toBe("1 партнёр");
    expect(fmt.format({ count: 2 })).toBe("2 партнёра");
    expect(fmt.format({ count: 5 })).toBe("5 партнёров");
    expect(fmt.format({ count: 21 })).toBe("21 партнёр");
    expect(fmt.format({ count: 22 })).toBe("22 партнёра");
    expect(fmt.format({ count: 100 })).toBe("100 партнёров");
  });

  it("Ukrainian plurals use one/few/many/other categories", () => {
    const uk = loadMessages("uk");
    const partnersMsg = uk.get("common.partners")!;

    const fmt = new IntlMessageFormat(partnersMsg, "uk");
    expect(fmt.format({ count: 0 })).toBe("немає партнерів");
    expect(fmt.format({ count: 1 })).toBe("1 партнер");
    expect(fmt.format({ count: 2 })).toBe("2 партнери");
    expect(fmt.format({ count: 5 })).toBe("5 партнерів");
    expect(fmt.format({ count: 21 })).toBe("21 партнер");
    expect(fmt.format({ count: 22 })).toBe("22 партнери");
    expect(fmt.format({ count: 100 })).toBe("100 партнерів");
  });

  it("English plurals use one/other categories", () => {
    const en = loadMessages("en");
    const partnersMsg = en.get("common.partners")!;

    const fmt = new IntlMessageFormat(partnersMsg, "en");
    expect(fmt.format({ count: 0 })).toBe("no partners");
    expect(fmt.format({ count: 1 })).toBe("1 partner");
    expect(fmt.format({ count: 5 })).toBe("5 partners");
  });

  it("nested plural in tooManyAttempts works for all locales", () => {
    for (const locale of LOCALES) {
      const messages = loadMessages(locale);
      const msg = messages.get("auth.tooManyAttempts")!;
      const fmt = new IntlMessageFormat(msg, locale);
      const result = fmt.format({ minutes: 5 });
      expect(
        typeof result === "string" && result.length > 0,
        `${locale} tooManyAttempts should produce a non-empty string`,
      ).toBe(true);
    }
  });
});
