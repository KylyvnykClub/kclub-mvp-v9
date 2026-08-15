import { describe, expect, it } from "vitest";
import { createCardPublicToken, hashCardToken } from "./card-token";

describe("card token derivation (FR-022)", () => {
  it("FR-022: derives a stable public token without returning the card id alone", () => {
    const cardId = "00000000-0000-4000-8000-000000000001";
    const token = createCardPublicToken(cardId, "secret");

    expect(token).toBe(createCardPublicToken(cardId, "secret"));
    expect(token).toMatch(/^card_v1_00000000-0000-4000-8000-000000000001_/);
    expect(token).not.toBe(cardId);
  });

  it("FR-022: changes derived public tokens when the signing secret changes", () => {
    const cardId = "00000000-0000-4000-8000-000000000001";

    expect(createCardPublicToken(cardId, "one")).not.toBe(
      createCardPublicToken(cardId, "two"),
    );
  });

  it("hashes QR bearer tokens for lookup storage", () => {
    const token = createCardPublicToken(
      "00000000-0000-4000-8000-000000000001",
      "secret",
    );

    expect(hashCardToken(token)).toBe(hashCardToken(token));
    expect(hashCardToken(token)).not.toBe(token);
    expect(hashCardToken(token)).toHaveLength(64);
  });
});
