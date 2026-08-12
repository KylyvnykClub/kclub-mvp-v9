import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ledger = readFileSync(
  "docs/delivery/production-launch-evidence.md",
  "utf8",
);

const acceptanceIds = [
  "AC-01",
  "AC-02",
  "AC-03",
  "AC-04",
  "AC-05",
  "AC-06",
  "AC-07",
  "AC-08",
  "AC-09",
  "AC-10",
  "AC-11",
  "AC-12",
] as const;

describe("constraint: production launch evidence ledger", () => {
  it("tracks every launch acceptance criterion as a separate row", () => {
    for (const id of acceptanceIds) {
      expect(ledger, `Missing ${id}`).toContain("|`" + id + "`");
    }
  });

  it("uses explicit launch status values instead of prose-only progress", () => {
    for (const status of [
      "blocked",
      "in_progress",
      "ready_for_rehearsal",
      "complete",
    ]) {
      expect(ledger, `Missing status ${status}`).toContain("|`" + status + "`");
    }
  });
});
