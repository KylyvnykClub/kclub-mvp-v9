import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FR-030 / ADR 0034: the partner catalogue is public.
 *
 * The seed already defaulted `public_catalogue` to true and production was
 * still closed, because the seed only inserts a flag a database lacks and
 * production had been migrated, not seeded. The catalogue being open is a
 * decision, so it travels as a migration — and nothing else in the suite would
 * notice if that migration were dropped or downgraded to an insert that leaves
 * an existing `false` row alone.
 */

const MIGRATION = join(
  process.cwd(),
  "db",
  "migrations",
  "20260912100000_public_catalogue.sql",
);

const DOWN = MIGRATION.replace(/\.sql$/, ".down.sql");

function read(path: string): string {
  return readFileSync(path, "utf8").toLowerCase().replace(/\s+/g, " ");
}

describe("constraint: the public catalogue (FR-030, ADR 0034)", () => {
  it("ships a migration that turns public_catalogue on", () => {
    const sql = read(MIGRATION);

    expect(sql).toContain("'public_catalogue'");
    expect(sql).toContain("insert into feature_flag");
    expect(sql).toContain("values ('public_catalogue', true");
  });

  it("overwrites an existing row rather than skipping it", () => {
    const sql = read(MIGRATION);

    // `ON CONFLICT DO NOTHING` would leave a database whose flag row exists and
    // reads false exactly as closed as before — the case this migration is for.
    expect(sql).not.toContain("do nothing");
    expect(sql).toContain("on conflict (name) do update");
    expect(sql).toContain("set enabled = true");
  });

  it("has a down migration that closes the catalogue again", () => {
    const sql = read(DOWN);

    expect(sql).toContain("update feature_flag");
    expect(sql).toContain("set enabled = false");
    expect(sql).toContain("'public_catalogue'");
  });
});
