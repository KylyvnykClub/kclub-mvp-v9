import { describe, expect, it } from "vitest";
import type { DbClient } from "@/data/db.js";
import { getMemberExportData } from "@/data/members.js";
import { cards, members, sessions } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

describe("privacy data export (FR-094)", () => {
  it("exports machine-readable member data without credential or token secrets", async () => {
    const db = testDbClient();
    const [member] = await db
      .insert(members)
      .values({
        phone: "+15556660001",
        passwordHash: "argon2-secret-hash",
        displayName: "Privacy Export",
        country: "US",
        language: "en",
        totpSecret: "totp-secret",
        totpEnabled: true,
      })
      .returning();

    await db.insert(cards).values({
      memberId: member!.id,
      serial: "KCLUB-PRIVACY-001",
      token: "raw-card-token",
      tokenHash: "hashed-card-token",
      tier: "vip",
    });
    await db.insert(sessions).values({
      memberId: member!.id,
      token: "raw-session-token",
      tokenHash: "hashed-session-token",
      userAgent: "vitest",
      ipAddress: "127.0.0.1",
    });

    const exported = await getMemberExportData(db, member!.id);
    expect(exported?.member.phone).toBe("+15556660001");
    expect(exported?.cards[0]?.serial).toBe("KCLUB-PRIVACY-001");
    expect(exported?.sessions[0]?.userAgent).toBe("vitest");

    const serialized = JSON.stringify(exported);
    expect(serialized).not.toContain("passwordHash");
    expect(serialized).not.toContain("argon2-secret-hash");
    expect(serialized).not.toContain("totpSecret");
    expect(serialized).not.toContain("totp-secret");
    expect(serialized).not.toContain("raw-card-token");
    expect(serialized).not.toContain("hashed-card-token");
    expect(serialized).not.toContain("raw-session-token");
    expect(serialized).not.toContain("hashed-session-token");
  });
});
