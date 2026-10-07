import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    server: { BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret" },
  },
}));
vi.mock("@/data/db", () => ({ db: {} }));

import {
  CONSENT_FIELDS,
  consentsComplete,
  consentTexts,
  disclosureLines,
  tickedConsents,
} from "./application-consents";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("ADR 0044: what the browser may say about consent", () => {
  it("reads only the five known boxes, and only when ticked", () => {
    const ticked = tickedConsents(
      form({
        [CONSENT_FIELDS.terms]: "on",
        [CONSENT_FIELDS.payment_authority]: "off",
        consentEverything: "on",
      }),
    );
    expect([...ticked]).toEqual(["terms"]);
  });

  it("refuses an application without the payment box when there is something to pay", () => {
    const data = form({
      [CONSENT_FIELDS.terms]: "on",
      [CONSENT_FIELDS.publication]: "on",
    });
    expect(consentsComplete(data, true)).toBe(false);
    expect(consentsComplete(data, false)).toBe(true);
  });
});

describe("ADR 0044: the recorded words are the catalogue's, per route and locale", () => {
  it("records the spec's Russian wording for an invited business", async () => {
    const texts = await consentTexts("ru", "invite");
    expect(texts.payment_authority).toContain(
      "после публикации одобренного бизнеса и окончания одного бесплатного календарного месяца",
    );
    expect(texts.payment_authority).toContain(
      "Ожидание одобрения не входит в бесплатный месяц",
    );
  });

  it("records a different payment text for the public reservation", async () => {
    const [invite, hold, setup] = await Promise.all([
      consentTexts("en", "invite"),
      consentTexts("en", "public_hold"),
      consentTexts("en", "public_setup"),
    ]);
    expect(hold.payment_authority).toContain("reservation of 19.99 USD");
    expect(hold.payment_authority).toContain("There is no free month");
    expect(
      new Set([invite, hold, setup].map((t) => t.payment_authority)).size,
    ).toBe(3);
  });

  it("strips the link markup but keeps the document names", async () => {
    const texts = await consentTexts("uk", "public_hold");
    expect(texts.terms).not.toMatch(/<\/?\w+>/);
    expect(texts.terms).toContain("Partner Rules");
    expect(texts.terms).toContain("Refund Policy");
  });

  it("records no payment text when there is nothing to pay", async () => {
    const texts = await consentTexts("en", null);
    expect(texts.payment_authority).toBe("");
  });

  it("discloses the seller, the price with taxes, renewal, start and cancellation", async () => {
    const lines = await disclosureLines("en", "invite");
    expect(lines.join("\n")).toMatch(/Kylyvnyk Consulting LLC/);
    expect(lines.join("\n")).toMatch(
      /\$19\.99 USD a month\. Taxes are included/,
    );
    expect(lines.join("\n")).toMatch(/renews automatically/);
    expect(lines.join("\n")).toMatch(/first month from publication is free/);
    expect(lines.join("\n")).toMatch(/Cancel auto-renewal/);
  });
});
