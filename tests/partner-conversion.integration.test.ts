import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import type { DbClient } from "@/data/db.js";
import { insertCompany } from "@/data/companies.js";
import {
  convertToPartnerAccount,
  loadMembershipAccess,
  memberCanBecomePartner,
} from "@/data/membership-access.js";
import { members, subscriptions } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * FR-103, FR-110: a person who registered as a member but never paid dues and
 * applies as a business becomes a partner account. They then pay for the
 * listing instead of the dues - and until they do, the club stays closed.
 */

function db(): DbClient {
  return getTestDb() as unknown as DbClient;
}

async function seedMember(
  duesKind: "paying" | "sponsored" | "partner" | "legacy_free" = "paying",
) {
  const [member] = await db()
    .insert(members)
    .values({
      phone: `+15558${crypto.randomUUID().replace(/\D/g, "").slice(0, 7)}`,
      passwordHash: "hash",
      displayName: "Would-be partner",
      country: "UA",
      language: "uk",
      role: "member",
      status: "active",
      duesKind,
    })
    .returning();
  return member!;
}

async function subscribe(
  memberId: string,
  plan: "membership" | "vip",
  status: string,
) {
  await db()
    .insert(subscriptions)
    .values({
      plan,
      memberId,
      stripeCustomerId: `cus_${crypto.randomUUID()}`,
      stripeSubscriptionId: `sub_${crypto.randomUUID()}`,
      status,
      priceId: `price_${crypto.randomUUID()}`,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    } as typeof subscriptions.$inferInsert);
}

async function duesKindOf(memberId: string) {
  const [row] = await db()
    .select({ duesKind: members.duesKind })
    .from(members)
    .where(eq(members.id, memberId));
  return row?.duesKind;
}

describe("FR-110: an unpaid member may apply as a business instead", () => {
  it("FR-110: converts a member who registered and never paid", async () => {
    const member = await seedMember("paying");

    await expect(memberCanBecomePartner(db(), member.id)).resolves.toBe(true);
    await expect(convertToPartnerAccount(db(), member.id)).resolves.toBe(true);
    expect(await duesKindOf(member.id)).toBe("partner");
  });

  it("FR-103: a converted account is still outside the club until the listing is paid", async () => {
    const member = await seedMember("paying");
    await convertToPartnerAccount(db(), member.id);

    await expect(
      loadMembershipAccess(
        db(),
        { id: member.id, duesKind: "partner" },
        new Date(),
      ),
    ).resolves.toBe("awaiting_payment");
  });

  it("FR-110: never converts anyone who has held membership or VIP, even lapsed", async () => {
    for (const [plan, status] of [
      ["membership", "active"],
      ["membership", "canceled"],
      ["vip", "active"],
    ] as const) {
      const member = await seedMember("paying");
      await subscribe(member.id, plan, status);

      await expect(memberCanBecomePartner(db(), member.id)).resolves.toBe(
        false,
      );
      await expect(convertToPartnerAccount(db(), member.id)).resolves.toBe(
        false,
      );
      expect(await duesKindOf(member.id)).toBe("paying");
    }
  });

  it("FR-110: never converts a sponsored, legacy or partner account", async () => {
    for (const duesKind of ["sponsored", "legacy_free", "partner"] as const) {
      const member = await seedMember(duesKind);
      await expect(convertToPartnerAccount(db(), member.id)).resolves.toBe(
        false,
      );
      expect(await duesKindOf(member.id)).toBe(duesKind);
    }
  });

  it("FR-110: never converts a member who already owns a company", async () => {
    const member = await seedMember("paying");
    await insertCompany(db(), {
      ownerId: member.id,
      name: "Owned Co",
      slug: `owned-${crypto.randomUUID().slice(0, 8)}`,
    });

    await expect(convertToPartnerAccount(db(), member.id)).resolves.toBe(false);
    expect(await duesKindOf(member.id)).toBe("paying");
  });

  it("FR-110: converts once - a second call changes nothing", async () => {
    const member = await seedMember("paying");
    await expect(convertToPartnerAccount(db(), member.id)).resolves.toBe(true);
    await expect(convertToPartnerAccount(db(), member.id)).resolves.toBe(false);
  });
});
