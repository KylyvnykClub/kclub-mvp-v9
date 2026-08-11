/**
 * Generate .env.example from the Zod schemas in src/env.schema.ts.
 *
 * Usage: pnpm env:example
 *
 * Strategy: parse an empty object against each schema to discover which keys
 * are required (they appear in the error). The output is the authoritative
 * list — editing .env.example by hand is overwritten on the next run.
 */

import { serverSchema, clientSchema } from "../src/env.schema.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyZodObject = z.ZodObject<any>;

function allKeys(schema: AnyZodObject): string[] {
  return Object.keys(
    (schema as unknown as { shape: Record<string, unknown> }).shape,
  );
}

function requiredKeys(schema: AnyZodObject): Set<string> {
  const result = schema.safeParse({});
  if (result.success) return new Set();
  return new Set(
    result.error.issues.map((i) => i.path[0] as string).filter(Boolean),
  );
}

function placeholder(name: string): string {
  if (name.startsWith("STRIPE_SECRET")) return "sk_test_REPLACE_ME";
  if (name.startsWith("STRIPE_WEBHOOK")) return "whsec_REPLACE_ME";
  if (name.startsWith("STRIPE") && name.endsWith("PRICE_ID"))
    return "price_REPLACE_ME";
  if (name.startsWith("NEXT_PUBLIC_STRIPE") && name.endsWith("PRICE_ID"))
    return "price_REPLACE_ME";
  if (name.startsWith("NEXT_PUBLIC_STRIPE")) return "pk_test_REPLACE_ME";
  if (name.includes("URL") || name.includes("_DSN"))
    return "https://REPLACE_ME";
  return "REPLACE_ME";
}

function generate(): string {
  const serverKeys = allKeys(serverSchema);
  const clientKeys = allKeys(clientSchema);
  const serverRequired = requiredKeys(serverSchema);
  const clientRequired = requiredKeys(clientSchema);

  const seen = new Set<string>();
  const lines: string[] = [
    "# KCLUB v9 — Environment Variables",
    "# Generated from src/env.ts — do not edit by hand.",
    "# Copy to .env.local and fill in values.",
    "#",
    "# Required variables are uncommented; optional are commented out.",
    "",
  ];

  for (const name of serverKeys) {
    if (seen.has(name)) continue;
    seen.add(name);
    const value = placeholder(name);
    if (serverRequired.has(name)) {
      lines.push(`${name}=${value}`);
    } else {
      lines.push(`# ${name}=${value}`);
    }
  }

  lines.push("");
  lines.push("# ── Client (NEXT_PUBLIC_*) ─────────────────────────────");

  for (const name of clientKeys) {
    if (seen.has(name)) continue;
    seen.add(name);
    const value = placeholder(name);
    if (clientRequired.has(name)) {
      lines.push(`${name}=${value}`);
    } else {
      lines.push(`# ${name}=${value}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

const output = generate();
const target = join(import.meta.dirname, "..", ".env.example");
writeFileSync(target, output, "utf-8");
const requiredCount = output
  .split("\n")
  .filter((l) => !l.startsWith("#") && l.includes("=")).length;
console.log(`.env.example written (${requiredCount} required variables)`);
