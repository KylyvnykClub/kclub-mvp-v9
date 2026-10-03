import { describe, expect, it } from "vitest";

import type { DbClient } from "@/data/db.js";
import {
  findCompanyById,
  insertCompany,
  listCompanyIdsWithPaidListing,
  revokeListingWaiver,
  waiveListingByStaff,
} from "@/data/companies.js";
import { members } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

/** ADR 0041: a moderator waives a listing from the console, and takes it back. */

function db(): DbClient {
  return getTestDb() as unknown as DbClient;
}

async function seedCompany(
  moderationStatus: "pending" | "approved" | "rejected",
) {
  const [member] = await db()
    .insert(members)
    .values({
      phone: `+15557${crypto.randomUUID().replace(/\D/g, "").slice(0, 7)}`,
      passwordHash: "hash",
      displayName: "Waived partner",
      country: "UA",
      language: "uk",
      role: "member",
      status: "active",
      duesKind: "partner",
    })
    .returning();
  return insertCompany(db(), {
    ownerId: member!.id,
    name: "Waived Co",
    slug: `waived-${crypto.randomUUID().slice(0, 8)}`,
    moderationStatus,
  });
}

describe("FR-121: staff publish a listing without payment", () => {
  it("FR-121: an approved, unpaid company is in the catalogue once waived", async () => {
    const companyId = await seedCompany("approved");
    const now = new Date();
    expect(await listCompanyIdsWithPaidListing(db(), now)).not.toContain(
      companyId,
    );

    await expect(waiveListingByStaff(db(), companyId, now)).resolves.toBe(true);

    const company = await findCompanyById(db(), companyId);
    expect(company?.listingWaivedAt).toBeInstanceOf(Date);
    expect(company?.listingWaiverLinkId).toBeNull();
    expect(await listCompanyIdsWithPaidListing(db(), now)).toContain(companyId);
  });

  it("FR-121: waiving twice changes nothing the second time", async () => {
    const companyId = await seedCompany("pending");
    await waiveListingByStaff(db(), companyId, new Date());
    await expect(
      waiveListingByStaff(db(), companyId, new Date()),
    ).resolves.toBe(false);
  });

  it("FR-121: a rejected company is not waived", async () => {
    const companyId = await seedCompany("rejected");
    await expect(
      waiveListingByStaff(db(), companyId, new Date()),
    ).resolves.toBe(false);
    expect(
      (await findCompanyById(db(), companyId))?.listingWaivedAt,
    ).toBeNull();
  });

  it("FR-121: an unknown company is not waived", async () => {
    await expect(
      waiveListingByStaff(db(), crypto.randomUUID(), new Date()),
    ).resolves.toBe(false);
  });

  it("FR-121: withdrawing the waiver takes an unpaid listing out of the catalogue", async () => {
    const companyId = await seedCompany("approved");
    await waiveListingByStaff(db(), companyId, new Date());

    await expect(revokeListingWaiver(db(), companyId)).resolves.toBe(true);
    expect(
      (await findCompanyById(db(), companyId))?.listingWaivedAt,
    ).toBeNull();
    expect(await listCompanyIdsWithPaidListing(db(), new Date())).not.toContain(
      companyId,
    );
    await expect(revokeListingWaiver(db(), companyId)).resolves.toBe(false);
  });
});
