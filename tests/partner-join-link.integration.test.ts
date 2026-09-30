import { describe, expect, it } from "vitest";

import type { Db, DbClient } from "@/data/db.js";
import {
  findCompanyById,
  insertCompany,
  companyListingIsPaid,
  listCompanyIdsWithPaidListing,
  listPendingCompanies,
  setCompanyModerationStatus,
  waiveListingByPartnerLink,
} from "@/data/companies.js";
import {
  findActiveJoinLink,
  findActiveJoinLinkById,
  revokeActiveJoinLink,
  rotateJoinLink,
} from "@/data/join-links.js";
import { loadMembershipAccess } from "@/data/membership-access.js";
import { members } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * ADR 0040: the owner's partner link. A second kind of join link, next to the
 * member link of ADR 0033: an application filed through it has its listing
 * waived - no card hold, straight to review, published on approval for free.
 */

function db(): DbClient {
  return getTestDb() as unknown as DbClient;
}
function tx(): Db {
  return getTestDb() as unknown as Db;
}

const secret = () => `s_${crypto.randomUUID()}`;

async function seedPartnerApplication() {
  const [member] = await db()
    .insert(members)
    .values({
      phone: `+15556${crypto.randomUUID().replace(/\D/g, "").slice(0, 7)}`,
      passwordHash: "hash",
      displayName: "Linked partner",
      country: "UA",
      language: "uk",
      role: "member",
      status: "active",
      duesKind: "partner",
    })
    .returning();
  const companyId = await insertCompany(db(), {
    ownerId: member!.id,
    name: "Linked Co",
    slug: `linked-${crypto.randomUUID().slice(0, 8)}`,
    moderationStatus: "pending",
  });
  return { member: member!, companyId };
}

describe("FR-106: one live link of each kind", () => {
  it("FR-106: rotating the partner link leaves the member link open, and back", async () => {
    const member = await rotateJoinLink(tx(), "member", secret(), null);
    const partner = await rotateJoinLink(tx(), "partner", secret(), null);

    expect((await findActiveJoinLink(db(), "member"))?.id).toBe(member.id);
    expect((await findActiveJoinLink(db(), "partner"))?.id).toBe(partner.id);

    const nextPartner = await rotateJoinLink(tx(), "partner", secret(), null);
    expect((await findActiveJoinLink(db(), "member"))?.id).toBe(member.id);
    expect((await findActiveJoinLink(db(), "partner"))?.id).toBe(
      nextPartner.id,
    );
    expect(await findActiveJoinLinkById(db(), partner.id)).toBeNull();
  });

  it("FR-106: revoking one kind does not close the other", async () => {
    const member = await rotateJoinLink(tx(), "member", secret(), null);
    await rotateJoinLink(tx(), "partner", secret(), null);

    await expect(revokeActiveJoinLink(tx(), "partner")).resolves.toBe(true);
    expect(await findActiveJoinLink(db(), "partner")).toBeNull();
    expect((await findActiveJoinLink(db(), "member"))?.id).toBe(member.id);
  });

  it("FR-105: a link knows its kind, so a partner link never sponsors a member", async () => {
    const partner = await rotateJoinLink(tx(), "partner", secret(), null);
    expect((await findActiveJoinLinkById(db(), partner.id))?.kind).toBe(
      "partner",
    );
  });
});

describe("FR-105: an application through the partner link has its listing waived", () => {
  it("FR-105: waives a pending application through the active partner link", async () => {
    const link = await rotateJoinLink(tx(), "partner", secret(), null);
    const { companyId } = await seedPartnerApplication();

    await expect(
      waiveListingByPartnerLink(db(), companyId, link.id, new Date()),
    ).resolves.toBe(true);
    const company = await findCompanyById(db(), companyId);
    expect(company?.listingWaivedAt).toBeInstanceOf(Date);
    expect(company?.listingWaiverLinkId).toBe(link.id);
  });

  it("FR-105: a revoked partner link waives nothing", async () => {
    const link = await rotateJoinLink(tx(), "partner", secret(), null);
    await revokeActiveJoinLink(tx(), "partner");
    const { companyId } = await seedPartnerApplication();

    await expect(
      waiveListingByPartnerLink(db(), companyId, link.id, new Date()),
    ).resolves.toBe(false);
  });

  it("FR-105: a member link waives no listing", async () => {
    const link = await rotateJoinLink(tx(), "member", secret(), null);
    const { companyId } = await seedPartnerApplication();

    await expect(
      waiveListingByPartnerLink(db(), companyId, link.id, new Date()),
    ).resolves.toBe(false);
  });

  it("FR-105: an approved company cannot be waived after the fact", async () => {
    const link = await rotateJoinLink(tx(), "partner", secret(), null);
    const { companyId } = await seedPartnerApplication();
    await setCompanyModerationStatus(db(), companyId, "approved", null);

    await expect(
      waiveListingByPartnerLink(db(), companyId, link.id, new Date()),
    ).resolves.toBe(false);
  });
});

describe("FR-113, FR-044, FR-110: a waived listing stands in for payment", () => {
  it("FR-113: enters the review queue without a card hold, and can be approved", async () => {
    const link = await rotateJoinLink(tx(), "partner", secret(), null);
    const { companyId } = await seedPartnerApplication();

    const beforeWaiver = await listPendingCompanies(db(), new Date());
    expect(beforeWaiver.map((c) => c.id)).not.toContain(companyId);

    await waiveListingByPartnerLink(db(), companyId, link.id, new Date());
    const queue = await listPendingCompanies(db(), new Date());
    expect(queue.map((c) => c.id)).toContain(companyId);

    await expect(
      setCompanyModerationStatus(db(), companyId, "approved", null, {
        kind: "capturable_hold",
        now: new Date(),
      }),
    ).resolves.toBe(true);
  });

  it("FR-044: counts as a paid listing for publication once approved", async () => {
    const link = await rotateJoinLink(tx(), "partner", secret(), null);
    const { companyId } = await seedPartnerApplication();
    expect(await listCompanyIdsWithPaidListing(db(), new Date())).not.toContain(
      companyId,
    );

    await waiveListingByPartnerLink(db(), companyId, link.id, new Date());
    // Not before approval: nothing unapproved is published anyway, and the
    // admin's "paid" badge must not claim it.
    expect(await listCompanyIdsWithPaidListing(db(), new Date())).not.toContain(
      companyId,
    );

    await setCompanyModerationStatus(db(), companyId, "approved", null);
    expect(await listCompanyIdsWithPaidListing(db(), new Date())).toContain(
      companyId,
    );
    await expect(
      companyListingIsPaid(db(), companyId, new Date()),
    ).resolves.toBe(true);
  });

  it("FR-110: opens the club for its partner only once approved", async () => {
    const link = await rotateJoinLink(tx(), "partner", secret(), null);
    const { member, companyId } = await seedPartnerApplication();
    await waiveListingByPartnerLink(db(), companyId, link.id, new Date());

    await expect(loadMembershipAccess(db(), member, new Date())).resolves.toBe(
      "awaiting_payment",
    );

    await setCompanyModerationStatus(db(), companyId, "approved", null, {
      kind: "capturable_hold",
      now: new Date(),
    });
    await expect(loadMembershipAccess(db(), member, new Date())).resolves.toBe(
      "active",
    );
  });
});
