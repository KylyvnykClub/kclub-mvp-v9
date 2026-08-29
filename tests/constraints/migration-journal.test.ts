import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * drizzle-kit applies a migration only when its journal `when` is greater than
 * the `created_at` of the last migration already in the database. The values
 * are hand-set in this repository, and once they went backwards (idx 30 below
 * idx 29) drizzle-kit silently skipped a migration against production
 * (backlog: migration-journal-when-not-monotonic). A from-zero build does not
 * notice — every entry applies — so this is the only place the property is
 * checked before a real database is.
 */

const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

function readJournal(): JournalEntry[] {
  const raw = readFileSync(
    join(MIGRATIONS_DIR, "meta", "_journal.json"),
    "utf8",
  );
  return (JSON.parse(raw) as { entries: JournalEntry[] }).entries;
}

describe("constraint: migration journal", () => {
  it("_journal.json when values strictly increase with idx", () => {
    const entries = readJournal();
    const violations: string[] = [];

    entries.forEach((entry, index) => {
      expect(entry.idx).toBe(index);
      const previous = entries[index - 1];
      if (previous && entry.when <= previous.when) {
        violations.push(
          `${entry.tag} (when ${entry.when}) is not after ${previous.tag} (when ${previous.when})`,
        );
      }
    });

    expect(violations).toEqual([]);
  });

  it("every up-migration on disk has a journal entry, and every entry has both up and down files", () => {
    const files = readdirSync(MIGRATIONS_DIR);
    const upTags = files
      .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
      .map((f) => f.replace(/\.sql$/, ""));
    const journalTags = readJournal().map((entry) => entry.tag);

    expect([...upTags].sort()).toEqual([...journalTags].sort());

    const missingDown = journalTags.filter(
      (tag) => !files.includes(`${tag}.down.sql`),
    );
    expect(missingDown).toEqual([]);
  });
});
