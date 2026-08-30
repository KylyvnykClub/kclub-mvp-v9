import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every script under tools/ that opens DATABASE_URL must ask the database
 * which environment it is before touching it (ADR 0026). The beta seed once
 * landed in production because its guard read a CLI flag; the marker check in
 * tools/assert-database-environment.ts is the replacement, and this test is
 * what keeps a new tool from skipping it.
 */

const TOOLS_DIR = join(process.cwd(), "tools");

/** Matches a file that connects to the application database. */
const OPENS_DATABASE = /DATABASE_URL|src\/data\/db"|@neondatabase\/serverless/;

/** Files that match the pattern but do not open the application database. */
const ALLOWLIST = new Set([
  // The guard and the marker tool themselves.
  "assert-database-environment.ts",
  "db-mark-environment.ts",
  // Only mentions DATABASE_URL in prose; describes a URL, never connects.
  "beta-seed-guard.ts",
  // Throwaway Testcontainers databases with their own confirmation flag.
  "db-updownup.ts",
  "e2e-env.ts",
  // Pure function over an env object; never connects.
  "check-production-env.ts",
  "gen-env-example.ts",
]);

describe("constraint: every tool that opens DATABASE_URL asserts the database environment marker (ADR 0026)", () => {
  const files = readdirSync(TOOLS_DIR).filter(
    (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
  );

  const databaseTools = files.filter(
    (file) =>
      !ALLOWLIST.has(file) &&
      OPENS_DATABASE.test(readFileSync(join(TOOLS_DIR, file), "utf8")),
  );

  it("finds the tools this test exists for", () => {
    expect(databaseTools).toEqual(
      expect.arrayContaining([
        "seed.ts",
        "seed-categories.ts",
        "remove-beta-seed.ts",
        "check-stripe-delivery.ts",
      ]),
    );
  });

  it.each(databaseTools)("%s calls assertDatabaseEnvironment", (file) => {
    const source = readFileSync(join(TOOLS_DIR, file), "utf8");
    expect(source).toMatch(/from "\.\/assert-database-environment"/);
    expect(source).toMatch(/await assertDatabaseEnvironment\(/);
  });

  it("keeps the allowlist honest: every entry exists and does not call the guard", () => {
    for (const file of ALLOWLIST) {
      expect(files).toContain(file);
    }
  });
});
