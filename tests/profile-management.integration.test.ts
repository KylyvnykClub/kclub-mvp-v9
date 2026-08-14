import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DbClient } from "@/data/db.js";
import { updateMemberPersonalInfo, updateMemberPhone } from "@/data/members.js";
import { findMemberByPhone } from "@/data/identity.js";
import { cards, members } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

async function seedMember(
  db: DbClient,
  overrides: Partial<{
    phone: string;
    displayName: string;
    country: string;
    language: string;
  }> = {},
) {
  const [member] = await db
    .insert(members)
    .values({
      phone:
        overrides.phone ??
        `+1555${Math.floor(1_000_000 + Math.random() * 8_000_000)}`,
      passwordHash: "hash",
      displayName: overrides.displayName ?? "Test User",
      country: overrides.country ?? "US",
      language: overrides.language ?? "en",
    })
    .returning();

  await db.insert(cards).values({
    memberId: member!.id,
    serial: `KCLUB-${Math.floor(100_000 + Math.random() * 900_000)}`,
    token: `tok-${crypto.randomUUID()}`,
    tier: "free",
  });

  return member!;
}

describe("FR-008: update personal info (name, language, country)", () => {
  it("updates displayName, language, and country", async () => {
    const db = testDbClient();
    const member = await seedMember(db, {
      displayName: "Original Name",
      country: "US",
      language: "en",
    });

    const updated = await updateMemberPersonalInfo(db, member.id, {
      displayName: "New Name",
      language: "uk",
      country: "UA",
    });

    expect(updated).not.toBeNull();
    expect(updated!.displayName).toBe("New Name");
    expect(updated!.language).toBe("uk");
    expect(updated!.country).toBe("UA");
  });

  it("persists changes to the database", async () => {
    const db = testDbClient();
    const member = await seedMember(db);

    await updateMemberPersonalInfo(db, member.id, {
      displayName: "Persisted Name",
      language: "ru",
      country: "PL",
    });

    const [row] = await db
      .select()
      .from(members)
      .where(eq(members.id, member.id));

    expect(row!.displayName).toBe("Persisted Name");
    expect(row!.language).toBe("ru");
    expect(row!.country).toBe("PL");
  });

  it("returns null for a nonexistent member", async () => {
    const db = testDbClient();

    const result = await updateMemberPersonalInfo(
      db,
      "00000000-0000-0000-0000-000000000000",
      {
        displayName: "Ghost",
        language: "en",
        country: "US",
      },
    );

    expect(result).toBeNull();
  });
});

describe("FR-011: phone number change", () => {
  it("updates the phone number", async () => {
    const db = testDbClient();
    const member = await seedMember(db, { phone: "+15550001111" });

    const updated = await updateMemberPhone(db, member.id, "+15550002222");

    expect(updated).not.toBeNull();
    expect(updated!.phone).toBe("+15550002222");
  });

  it("new phone is findable after update", async () => {
    const db = testDbClient();
    const member = await seedMember(db, { phone: "+15550003333" });

    await updateMemberPhone(db, member.id, "+15550004444");

    const found = await findMemberByPhone(db, "+15550004444");
    expect(found).not.toBeNull();
    expect(found!.id).toBe(member.id);

    const oldLookup = await findMemberByPhone(db, "+15550003333");
    expect(oldLookup).toBeUndefined();
  });

  it("rejects duplicate phone via unique constraint", async () => {
    const db = testDbClient();
    await seedMember(db, { phone: "+15550005555" });
    const member2 = await seedMember(db, { phone: "+15550006666" });

    await expect(
      updateMemberPhone(db, member2.id, "+15550005555"),
    ).rejects.toThrow();
  });

  it("returns null for a nonexistent member", async () => {
    const db = testDbClient();

    const result = await updateMemberPhone(
      db,
      "00000000-0000-0000-0000-000000000000",
      "+15559999999",
    );

    expect(result).toBeNull();
  });
});
