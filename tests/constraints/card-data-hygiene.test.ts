import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getRegisteredRoutes } from "@/domain/route-registry.js";

/**
 * Constraint suite: Card data hygiene (FR-060)
 *
 * Proves that no card number, PAN, CVC, or expiry is stored in any database
 * table, and that all card-entry surfaces (checkout, portal) delegate to
 * Stripe-hosted sessions. Card data never enters our system.
 */

const SCHEMA_DIR = join(__dirname, "../../src/data/schema");

const FORBIDDEN_COLUMN_PATTERNS = [
  /card.?number/i,
  /\bpan\b/i,
  /\bcvc\b/i,
  /\bcvv\b/i,
  /card.?exp/i,
  /expir(?:y|ation).?(?:month|year|date)/i,
  /\bcc.?num/i,
  /\bbin\b(?!ary)/i,
  /last.?four/i,
  /last.?4/i,
  /card.?holder/i,
  /account.?number/i,
  /routing.?number/i,
];

const CHECKOUT_ACTION_PATHS = [
  "action:createVipCheckoutAction",
  "action:createCheckoutSessionAction",
  "action:createPortalSessionAction",
];

describe("constraint: card data hygiene (FR-060)", () => {
  it("schema directory contains table definitions to walk", () => {
    const files = readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(5);
  });

  it("no schema file defines a column that could store card data", () => {
    const files = readdirSync(SCHEMA_DIR).filter(
      (f) => f.endsWith(".ts") && f !== "index.ts" && f !== "relations.ts",
    );

    const violations: string[] = [];

    for (const file of files) {
      const content = readFileSync(join(SCHEMA_DIR, file), "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        for (const pattern of FORBIDDEN_COLUMN_PATTERNS) {
          if (pattern.test(line)) {
            violations.push(
              `${file}:${i + 1} matches ${pattern}: ${line.trim()}`,
            );
          }
        }
      }
    }

    expect(
      violations,
      `Card data columns found in schema:\n${violations.join("\n")}`,
    ).toHaveLength(0);
  });

  it("the cards table stores only serial, token, tier, and status — no payment data", () => {
    const content = readFileSync(join(SCHEMA_DIR, "cards.ts"), "utf-8");

    expect(content).toContain("serial");
    expect(content).toContain("token");
    expect(content).toContain("tier");
    expect(content).toContain("status");

    expect(content).not.toMatch(/card.?number/i);
    expect(content).not.toMatch(/\bcvc\b/i);
    expect(content).not.toMatch(/\bcvv\b/i);
    expect(content).not.toMatch(/expir/i);
  });

  it("FR-057/FR-060: all checkout and portal actions use Stripe-hosted sessions (not custom forms)", () => {
    const stripeActionsSource = readFileSync(
      join(__dirname, "../../src/actions/stripe.ts"),
      "utf-8",
    );

    expect(stripeActionsSource).toContain("stripe.checkout.sessions.create");
    expect(stripeActionsSource).toContain(
      "stripe.billingPortal.sessions.create",
    );
    expect(stripeActionsSource).toContain("redirect(session.url)");
    expect(stripeActionsSource).toContain("redirect(portalSession.url)");

    expect(stripeActionsSource).not.toMatch(
      /card.?element|CardElement|card.?field|payment.?input/i,
    );
    expect(stripeActionsSource).not.toMatch(
      /<input.*type=["'](?:text|number)["'].*card/i,
    );
  });

  it("FR-057: checkout and portal routes are registered in the route registry", () => {
    const routes = getRegisteredRoutes();
    for (const actionPath of CHECKOUT_ACTION_PATHS) {
      const found = routes.some((r) => r.path === actionPath);
      expect(
        found,
        `${actionPath} must be registered in the route registry`,
      ).toBe(true);
    }
  });

  describe("proved to fail", () => {
    it("detects a column that would store card data", () => {
      const fakeSchemaContent = `
        export const payments = pgTable("payments", {
          cardNumber: varchar("card_number", { length: 19 }),
          cvc: varchar("cvc", { length: 4 }),
        });
      `;

      const violations: string[] = [];
      const lines = fakeSchemaContent.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        for (const pattern of FORBIDDEN_COLUMN_PATTERNS) {
          if (pattern.test(line)) {
            violations.push(`fake:${i + 1} matches ${pattern}`);
          }
        }
      }

      expect(
        violations.length,
        "The walker must detect card data columns",
      ).toBeGreaterThan(0);
    });
  });
});
