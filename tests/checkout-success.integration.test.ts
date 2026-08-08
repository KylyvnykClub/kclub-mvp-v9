import { describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { DbClient } from "@/data/db.js";
import { getTestDb } from "./setup/integration-setup.js";
import { cards, members } from "@/data/schema/index.js";

// Mock next-intl/server before importing the page
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn(() => Promise.resolve(vi.fn((key: string) => key))),
}));

import CheckoutSuccessPage from "@/app/[locale]/(dashboard)/dashboard/checkout/success/page.js";

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
  it("T-4.1: rendering the checkout success page does not change the member's card tier (no-grant test)", async () => {
    const db = testDbClient();
    const memberId = "22222222-2222-4222-8222-222222222222";
    await seedMemberAndCard(db, memberId);

    const initialTier = await cardTierOf(db, memberId);
    expect(initialTier).toBe("free");

    // "Visit" the page by calling its render function directly.
    // The page is purely for display and has no side effects.
    await CheckoutSuccessPage({ params: Promise.resolve({ locale: "en" }) });

    // Ensure the tier remains unchanged.
    const finalTier = await cardTierOf(db, memberId);
    expect(finalTier).toBe("free");
  });
});
