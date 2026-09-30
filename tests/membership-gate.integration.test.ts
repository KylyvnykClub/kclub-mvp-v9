import { describe, expect, it } from "vitest";

import type { DbClient } from "@/data/db.js";
import { insertCompany } from "@/data/companies.js";
import {
  awaitsPaymentOutsideClub,
  ownsLiveApplication,
} from "@/data/membership-access.js";
import { members } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * FR-103: one answer to "is this member outside the club, waiting to pay",
 * shared by the dashboard gate, the pricing page, the partner page and the
 * listing hold's return address - so they cannot disagree about staff again.
 */

function db(): DbClient {
  return getTestDb() as unknown as DbClient;
}

async function seedMember(
  role: "member" | "staff_support" | "staff_owner",
  duesKind: "paying" | "sponsored" | "partner" = "paying",
) {
  const [member] = await db()
    .insert(members)
    .values({
      phone: `+15559${crypto.randomUUID().replace(/\D/g, "").slice(0, 7)}`,
      passwordHash: "hash",
      displayName: "Gate subject",
      country: "UA",
      language: "uk",
      role,
      status: "active",
      duesKind,
    })
    .returning();
  return member!;
}

describe("FR-103: who stands outside the club", () => {
  it("FR-103: an unpaid member is outside", async () => {
    const member = await seedMember("member", "paying");
    await expect(
      awaitsPaymentOutsideClub(db(), member, new Date()),
    ).resolves.toBe(true);
  });

  it("FR-105: a sponsored member is inside without paying", async () => {
    const member = await seedMember("member", "sponsored");
    await expect(
      awaitsPaymentOutsideClub(db(), member, new Date()),
    ).resolves.toBe(false);
  });

  it("FR-103: an unpaid partner is outside until the listing is paid", async () => {
    const member = await seedMember("member", "partner");
    await expect(
      awaitsPaymentOutsideClub(db(), member, new Date()),
    ).resolves.toBe(true);
  });

  it("ADR 0007: staff are never outside, whatever their dues say", async () => {
    for (const role of ["staff_support", "staff_owner"] as const) {
      const staff = await seedMember(role, "paying");
      await expect(
        awaitsPaymentOutsideClub(db(), staff, new Date()),
      ).resolves.toBe(false);
    }
  });
});

describe("FR-110: one live application at a time, and a refusal is not the end", () => {
  it("FR-110: a pending application is live", async () => {
    const member = await seedMember("member");
    await insertCompany(db(), {
      ownerId: member.id,
      name: "Pending Co",
      slug: `pending-${crypto.randomUUID().slice(0, 8)}`,
      moderationStatus: "pending",
    });
    await expect(ownsLiveApplication(db(), member.id)).resolves.toBe(true);
  });

  it("FR-110: a rejected application does not stop another", async () => {
    const member = await seedMember("member");
    await insertCompany(db(), {
      ownerId: member.id,
      name: "Refused Co",
      slug: `refused-${crypto.randomUUID().slice(0, 8)}`,
      moderationStatus: "rejected",
    });
    await expect(ownsLiveApplication(db(), member.id)).resolves.toBe(false);
  });

  it("FR-110: nobody without companies has a live application", async () => {
    const member = await seedMember("member");
    await expect(ownsLiveApplication(db(), member.id)).resolves.toBe(false);
  });
});
