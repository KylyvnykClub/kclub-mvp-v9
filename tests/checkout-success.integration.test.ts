import { describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DbClient } from "@/data/db.js";
import { getTestDb } from "./setup/integration-setup.js";
import { cards, members } from "@/data/schema/index.js";

// Mock next-intl/server before importing the page
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn(() => Promise.resolve(vi.fn((key: string) => key))),
}));

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

async function seedMemberAndCard(db: DbClient, memberId: string) {
  await db.insert(members).values({
    id: memberId,
    phone: `+1${Math.floor(1_000_000_000 + Math.random() * 9_000_000_000)}`,
    passwordHash: "hash",
    displayName: "Test Member",
    country: "US",
    language: "en",
  });
  await db.insert(cards).values({
    memberId,
    serial: `KCLUB-${Math.floor(100_000 + Math.random() * 900_000)}`,
    token: `tok-${crypto.randomUUID()}`,
    tier: "free",
  });
}

async function cardTierOf(db: DbClient, memberId: string) {
  const rows = await db
    .select()
    .from(cards)
    .where(eq(cards.memberId, memberId));
  return rows[0]?.tier;
}

describe("Checkout Success Page (T-4.1)", () => {
  it("T-4.1: checkout success remains display-only and does not change card tier (no-grant test)", async () => {
    const db = testDbClient();
    const memberId = crypto.randomUUID();
    await seedMemberAndCard(db, memberId);

    const initialTier = await cardTierOf(db, memberId);
    expect(initialTier).toBe("free");

    const source = await readFile(
      join(
        process.cwd(),
        "src/app/[locale]/(dashboard)/dashboard/checkout/success/page.tsx",
      ),
      "utf-8",
    );

    expect(source).toContain("deliberately grants NO entitlement");
    expect(source).not.toContain("@/data/");
    expect(source).not.toContain("@/actions/stripe");
    expect(source).not.toContain("setCardTierForMember");

    // Ensure the tier remains unchanged.
    const finalTier = await cardTierOf(db, memberId);
    expect(finalTier).toBe("free");
  });
});
