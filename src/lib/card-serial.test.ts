import { describe, expect, it } from "vitest";

import {
  cardSerialCountry,
  formatCardSerial,
  isCardSerial,
  planCardSerialBackfill,
  type CardSerialRow,
} from "./card-serial";

function row(
  cardId: string,
  serial: string,
  issuedAt: string,
  phone = "+380501234567",
  residence = "UA",
): CardSerialRow {
  return { cardId, serial, issuedAt: new Date(issuedAt), phone, residence };
}

describe("FR-020: card serial is the phone's country and a club-wide number", () => {
  it("prints the first Ukrainian card as UA-10001", () => {
    expect(
      formatCardSerial(cardSerialCountry("+380501234567", "US"), 10001),
    ).toBe("UA-10001");
  });

  it("takes the country from the phone, not from the residence", () => {
    expect(cardSerialCountry("+12015550123", "UA")).toBe("US");
    expect(cardSerialCountry("+48501234567", "UA")).toBe("PL");
  });

  it("falls back to the residence when the phone cannot be placed", () => {
    expect(cardSerialCountry("not a phone", "de")).toBe("DE");
  });

  it("keeps growing past five digits rather than wrapping", () => {
    expect(formatCardSerial("UA", 123456)).toBe("UA-123456");
  });

  it("refuses a number below the sequence start or a malformed country", () => {
    expect(() => formatCardSerial("UA", 9999)).toThrow();
    expect(() => formatCardSerial("UA", 10001.5)).toThrow();
    expect(() => formatCardSerial("UKR", 10001)).toThrow();
    expect(() => formatCardSerial("ua", 10001)).toThrow();
  });

  it("recognises the new form and nothing older", () => {
    expect(isCardSerial("UA-10001")).toBe(true);
    expect(isCardSerial("KCLUB-123456")).toBe(false);
    expect(isCardSerial("ABCD-EFGH-IJKL-MNOP")).toBe(false);
  });
});

describe("FR-020: renumbering cards issued before the UA-10001 form", () => {
  it("renumbers the oldest card first, skipping cards already renumbered", () => {
    const plan = planCardSerialBackfill([
      row("c", "KCLUB-300000", "2026-09-03T00:00:00Z", "+12015550123"),
      row("a", "UA-10001", "2026-09-01T00:00:00Z"),
      row("b", "ABCD-EFGH-IJKL-MNOP", "2026-09-02T00:00:00Z"),
    ]);

    expect(plan).toEqual([
      { cardId: "b", from: "ABCD-EFGH-IJKL-MNOP", country: "UA" },
      { cardId: "c", from: "KCLUB-300000", country: "US" },
    ]);
  });

  it("is a no-op the second time", () => {
    expect(
      planCardSerialBackfill([row("a", "UA-10001", "2026-09-01T00:00:00Z")]),
    ).toEqual([]);
  });
});
