import { describe, expect, it } from "vitest";

import { planPhoneNormalisation, type PhoneRow } from "./phone-backfill";

function row(id: string, phone: string, country = "UA"): PhoneRow {
  return { id, phone, country };
}

/**
 * FR-001: the backfill that makes every stored number E.164 before the code
 * that assumes it ships (ADR 0027).
 *
 * This runs once, against real members, and it can lock people out of accounts
 * they are paying for. Its refusal is the interesting half.
 */
describe("FR-001: planning the E.164 backfill", () => {
  it("leaves a number that is already E.164 alone", () => {
    const plan = planPhoneNormalisation([row("a", "+380671234567")]);

    expect(plan.unchanged).toHaveLength(1);
    expect(plan.planned).toHaveLength(0);
    expect(plan.collisions).toHaveLength(0);
  });

  it("rewrites a number stored with separators", () => {
    const plan = planPhoneNormalisation([row("a", "+380 67 123 45 67")]);

    expect(plan.planned).toEqual([
      { row: row("a", "+380 67 123 45 67"), next: "+380671234567" },
    ]);
  });

  it("reads a national number using the member's own country", () => {
    const plan = planPhoneNormalisation([
      row("ua", "0671234567", "UA"),
      row("us", "2015550123", "US"),
    ]);

    expect(plan.planned.map((p) => p.next)).toEqual([
      "+380671234567",
      "+12015550123",
    ]);
  });

  it("falls back to the default country when the stored country is junk", () => {
    // Not a country code, so US is assumed - the number below is a US one.
    const plan = planPhoneNormalisation([row("a", "2015550123", "ZZ")]);

    expect(plan.planned[0]?.next).toBe("+12015550123");
  });

  it("leaves an unreadable number untouched rather than dropping it", () => {
    const plan = planPhoneNormalisation([row("a", "not a phone")]);

    expect(plan.unreadable).toHaveLength(1);
    expect(plan.planned).toHaveLength(0);
  });

  it("keeps a well-formed number that is not a real mobile", () => {
    // The seeded staff owner. The backfill must not touch or discard it.
    const plan = planPhoneNormalisation([row("owner", "+380000000000")]);

    expect(plan.unchanged).toHaveLength(1);
    expect(plan.collisions).toHaveLength(0);
  });
});

describe("FR-001: the backfill refuses to merge two members", () => {
  it("reports two spellings of one number as a collision", () => {
    const plan = planPhoneNormalisation([
      row("first", "+380671234567"),
      row("second", "+380 67 123 45 67"),
    ]);

    expect(plan.collisions).toHaveLength(1);
    expect(plan.collisions[0]?.number).toBe("+380671234567");
    expect(plan.collisions[0]?.owners.map((o) => o.id).sort()).toEqual([
      "first",
      "second",
    ]);
  });

  it("catches a rewritten row colliding with one left untouched", () => {
    const plan = planPhoneNormalisation([
      row("untouched", "+380671234567"),
      row("national", "0671234567"),
    ]);

    expect(plan.collisions).toHaveLength(1);
    expect(plan.collisions[0]?.owners).toHaveLength(2);
  });

  it("catches three rows collapsing onto one number", () => {
    const plan = planPhoneNormalisation([
      row("a", "+380671234567"),
      row("b", "+380 67 123 45 67"),
      row("c", "067 123 45 67"),
    ]);

    expect(plan.collisions).toHaveLength(1);
    expect(plan.collisions[0]?.owners).toHaveLength(3);
  });

  it("does not invent a collision between two different members", () => {
    const plan = planPhoneNormalisation([
      row("a", "+380 67 123 45 67"),
      row("b", "+380 99 111 22 33"),
      row("c", "not a phone"),
      row("d", "also not a phone"),
    ]);

    expect(plan.collisions).toHaveLength(0);
    expect(plan.planned).toHaveLength(2);
    expect(plan.unreadable).toHaveLength(2);
  });

  it("accounts for every row exactly once", () => {
    const rows = [
      row("a", "+380671234567"),
      row("b", "+380 99 111 22 33"),
      row("c", "not a phone"),
    ];
    const plan = planPhoneNormalisation(rows);

    expect(
      plan.unchanged.length + plan.planned.length + plan.unreadable.length,
    ).toBe(rows.length);
  });
});
