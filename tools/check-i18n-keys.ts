/**
 * CI gate: every key present in all three locales.
 *
 * Reads messages/{en,ru,uk}.json, flattens nested keys with dot notation,
 * and reports any key that exists in one locale but is missing from another.
 * Exits with code 1 when gaps are found.
 *
 * Usage: tsx tools/check-i18n-keys.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const LOCALES = ["en", "ru", "uk"] as const;
const MESSAGES_DIR = resolve(import.meta.dirname, "..", "messages");

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

const allKeys = new Set<string>();
const perLocale = new Map<string, Map<string, string>>();

for (const locale of LOCALES) {
  const keys = loadMessages(locale);
  perLocale.set(locale, keys);
  for (const key of keys.keys()) {
    allKeys.add(key);
  }
}

const errors: string[] = [];
const sortedKeys = [...allKeys].sort();

for (const key of sortedKeys) {
  for (const locale of LOCALES) {
    if (!perLocale.get(locale)!.has(key)) {
      errors.push(`  MISSING  ${locale}  ${key}`);
    }
  }
}

if (errors.length > 0) {
  console.error(`\ni18n key check failed — ${errors.length} missing key(s):\n`);
  for (const err of errors) {
    console.error(err);
  }
  console.error();
  process.exit(1);
} else {
  console.log(
    `i18n key check passed — ${allKeys.size} keys × ${LOCALES.length} locales, no gaps.`,
  );
}
