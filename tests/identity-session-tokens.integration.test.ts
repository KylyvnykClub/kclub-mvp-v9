import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DbClient } from "@/data/db.js";
import {
  createSessionTx,
  deleteSessionByToken,
  findActiveSessionByToken,
  upgradeSessionTx,
} from "@/data/identity.js";
import { members, sessions } from "@/data/schema/index.js";
import { hashSessionToken } from "@/lib/session-token.js";
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
      displayName: "Session Test",
      country: "US",
      language: "en",
    })
    .returning();

  return member!;
}

describe("identity session token storage", () => {
  it("stores new session tokens as hashes while authenticating with the raw bearer token", async () => {
    const db = testDbClient();
    const member = await seedMember(db);
    const rawToken = `session-${crypto.randomUUID()}`;
    const tokenHash = hashSessionToken(rawToken);

    await createSessionTx(db, {
      memberId: member.id,
      sessionToken: rawToken,
      userAgent: "vitest",
      ipAddress: "127.0.0.1",
    });

    const [stored] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.memberId, member.id));

    expect(stored?.token).toBe(tokenHash);
    expect(stored?.tokenHash).toBe(tokenHash);
    expect(stored?.token).not.toBe(rawToken);

    const authenticated = await findActiveSessionByToken(db, rawToken);
    expect(authenticated?.memberId).toBe(member.id);
  });

  it("keeps legacy plaintext sessions readable and removable during the expand migration", async () => {
    const db = testDbClient();
    const member = await seedMember(db);
    const legacyToken = `legacy-${crypto.randomUUID()}`;

    await db.insert(sessions).values({
      memberId: member.id,
      token: legacyToken,
      userAgent: "vitest",
      ipAddress: "127.0.0.1",
    });

    const authenticated = await findActiveSessionByToken(db, legacyToken);
    expect(authenticated?.memberId).toBe(member.id);

    await deleteSessionByToken(db, legacyToken);
    const afterDelete = await findActiveSessionByToken(db, legacyToken);
    expect(afterDelete).toBeNull();
  });

  it("upgrades hashed partial sessions without exposing the raw token in storage", async () => {
    const db = testDbClient();
    const member = await seedMember(db);
    const rawToken = `partial-${crypto.randomUUID()}`;
    const tokenHash = hashSessionToken(rawToken);

    await createSessionTx(db, {
      memberId: member.id,
      sessionToken: rawToken,
      userAgent: "vitest",
      ipAddress: "127.0.0.1",
      isPartialSession: true,
    });

    await upgradeSessionTx(db, rawToken, member.id, "127.0.0.1", "vitest");

    const [stored] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.memberId, member.id));

    expect(stored?.isPartialSession).toBe(false);
    expect(stored?.token).toBe(tokenHash);
    expect(stored?.tokenHash).toBe(tokenHash);
  });
});
