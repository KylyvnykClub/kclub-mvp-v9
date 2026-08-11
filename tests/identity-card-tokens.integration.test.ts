import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DbClient } from "@/data/db.js";
import {
  findCardByMemberId,
  findCardPublicByToken,
  insertCard,
} from "@/data/members.js";
import { cards, members } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

async function seedMember(db: DbClient) {
  const [member] = await db
    .insert(members)
    .values({
      phone: `+1${Math.floor(1_000_000_000 + Math.random() * 9_000_000_000)}`,
      passwordHash: "hash",
      displayName: "Card Token Test",
      country: "US",
      language: "en",
    })
    .returning();

  return member!;
}

describe("identity card token storage", () => {
  beforeAll(() => {
    process.env["BETTER_AUTH_SECRET"] ??= "integration-card-token-secret";
  });

  it("stores new card tokens as hashes while exposing a reproducible owner QR token", async () => {
    const db = testDbClient();
    const member = await seedMember(db);

    const created = await insertCard(db, {
      memberId: member.id,
      serial: `CARD-${crypto.randomUUID()}`,
      tier: "free",
    });

    const ownerCard = await findCardByMemberId(db, member.id);
    expect(ownerCard?.token).toMatch(/^card_v1_/);

    const [stored] = await db
      .select()
      .from(cards)
      .where(eq(cards.id, created.id));

    expect(stored?.token).toBe(stored?.tokenHash);
    expect(stored?.token).not.toBe(ownerCard?.token);

    const publicCard = await findCardPublicByToken(db, ownerCard!.token);
    expect(publicCard?.serial).toBe(created.serial);
  });

  it("keeps legacy plaintext card tokens readable during the expand migration", async () => {
    const db = testDbClient();
    const member = await seedMember(db);
    const legacyToken = `legacy-card-${crypto.randomUUID()}`;
    const serial = `LEGACY-${crypto.randomUUID()}`;

    await db.insert(cards).values({
      memberId: member.id,
      serial,
      token: legacyToken,
      tier: "free",
    });

    const publicCard = await findCardPublicByToken(db, legacyToken);
    expect(publicCard?.serial).toBe(serial);
  });
});
