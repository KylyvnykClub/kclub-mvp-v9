import { describe, expect, it } from "vitest";
import type { DbClient } from "@/data/db.js";
import {
  countMemberPresence,
  countMembers,
  countMembersByStatus,
  findMemberAdminById,
  searchMembers,
  withMemberActivityHistory,
} from "@/data/members.js";
import { appendAuditEntry } from "@/data/audit-log.js";
import { cards, members, subscriptions } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

async function seedMember(
  db: DbClient,
  input: {
    phoneSuffix: string;
    displayName?: string;
    role?: "member" | "member_vip" | "partner_owner" | "staff_support";
    status?: "active" | "blocked";
    country?: string;
    deletedAt?: Date;
  },
) {
  const [member] = await db
    .insert(members)
    .values({
      phone: `+15559${input.phoneSuffix}`,
      passwordHash: "hash",
      displayName: input.displayName ?? `Directory ${input.phoneSuffix}`,
      country: input.country ?? "US",
      language: "en",
      role: input.role ?? "member",
      status: input.status ?? "active",
      deletedAt: input.deletedAt ?? null,
    })
    .returning();

  return member!;
}

async function seedCard(
  db: DbClient,
  input: { memberId: string; serial: string; tier?: "free" | "vip" },
) {
  const [card] = await db
    .insert(cards)
    .values({
      memberId: input.memberId,
      serial: input.serial,
      token: `token_${crypto.randomUUID()}`,
      tokenHash: `hash_${crypto.randomUUID()}`,
      tier: input.tier ?? "free",
      status: "valid",
    })
    .returning();

  return card!;
}

describe("admin member directory (FR-083, FR-084)", () => {
  it("searches club members by name, phone, and card serial without exposing staff accounts", async () => {
    const db = testDbClient();
    const member = await seedMember(db, {
      phoneSuffix: "100001",
      displayName: "Ada Directory",
    });
    await seedCard(db, { memberId: member.id, serial: "KCLUB-SERIAL-001" });
    await seedMember(db, {
      phoneSuffix: "100002",
      displayName: "Ada Staff",
      role: "staff_support",
    });

    await expect(searchMembers(db, { query: "Ada" })).resolves.toHaveLength(1);
    await expect(searchMembers(db, { query: "100001" })).resolves.toHaveLength(
      1,
    );

    // The card serial is matched inside the same query as name and phone, so
    // a paginated page and its total are always taken over the same set.
    const serialMatches = await searchMembers(db, { query: "SERIAL-001" });
    expect(serialMatches.map((row) => row.id)).toEqual([member.id]);
  });

  it("pages the directory and counts it under the same filter", async () => {
    const db = testDbClient();
    const seeded = [];
    for (const [index, status] of (
      ["active", "active", "blocked"] as const
    ).entries()) {
      seeded.push(
        await seedMember(db, {
          phoneSuffix: `2000${index}`,
          displayName: `Pagedcohort ${index}`,
          status,
        }),
      );
    }

    const filters = { query: "Pagedcohort" };
    await expect(countMembers(db, filters)).resolves.toBe(3);
    await expect(countMembersByStatus(db, filters)).resolves.toEqual({
      active: 2,
      blocked: 1,
      pending_deletion: 0,
    });

    const first = await searchMembers(db, filters, { limit: 2, offset: 0 });
    const second = await searchMembers(db, filters, { limit: 2, offset: 2 });
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(1);
    expect(new Set([...first, ...second].map((row) => row.id))).toEqual(
      new Set(seeded.map((row) => row.id)),
    );

    const blocked = await searchMembers(db, {
      ...filters,
      status: "blocked",
    });
    expect(blocked.map((row) => row.id)).toEqual([seeded[2]!.id]);
  });

  it("returns subscriptions and activity history for member detail review", async () => {
    const db = testDbClient();
    const member = await seedMember(db, { phoneSuffix: "100003" });
    const card = await seedCard(db, {
      memberId: member.id,
      serial: "KCLUB-HISTORY-001",
      tier: "vip",
    });

    await db.insert(subscriptions).values({
      memberId: member.id,
      stripeCustomerId: `cus_${crypto.randomUUID()}`,
      stripeSubscriptionId: `sub_${crypto.randomUUID()}`,
      status: "active",
      priceId: `price_${crypto.randomUUID()}`,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });

    await appendAuditEntry(db, {
      actorType: "staff_admin",
      actorId: "staff-1",
      action: "revoke_card",
      subjectType: "card",
      subjectId: card.id,
      meta: {
        reason: "test",
        before: { status: "valid" },
        after: { status: "revoked" },
      },
    });

    const found = await findMemberAdminById(db, member.id);
    expect(found?.subscriptions).toHaveLength(1);

    const [withHistory] = await withMemberActivityHistory(db, [found!]);
    expect(withHistory!.activityHistory).toHaveLength(1);
    expect(withHistory!.activityHistory[0]?.action).toBe("revoke_card");
  });
});

describe("landing member presence", () => {
  it("counts active club members and their distinct countries, excluding staff, blocked, and erased accounts", async () => {
    const db = testDbClient();

    await seedMember(db, { phoneSuffix: "300001", country: "UA" });
    await seedMember(db, { phoneSuffix: "300002", country: "UA" });
    await seedMember(db, {
      phoneSuffix: "300003",
      country: "PL",
      role: "member_vip",
    });
    // None of these belong in the public numbers.
    await seedMember(db, {
      phoneSuffix: "300004",
      country: "DE",
      role: "staff_support",
    });
    await seedMember(db, {
      phoneSuffix: "300005",
      country: "FR",
      status: "blocked",
    });
    await seedMember(db, {
      phoneSuffix: "300006",
      country: "ES",
      deletedAt: new Date(),
    });

    await expect(countMemberPresence(db)).resolves.toEqual({
      members: 3,
      countries: 2,
    });
  });

  it("reports zeroes for an empty club rather than failing", async () => {
    const db = testDbClient();

    await expect(countMemberPresence(db)).resolves.toEqual({
      members: 0,
      countries: 0,
    });
  });
});
