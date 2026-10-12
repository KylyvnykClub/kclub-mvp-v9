import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Db, DbClient } from "@/data/db.js";
import { requestAccountDeletionTx } from "@/data/account-deletion.js";
import { eraseMemberTx } from "@/data/account-erasure.js";
import {
  findCompanyById,
  insertCompany,
  listApprovedCompaniesByIds,
  listCompaniesForAdmin,
  listUndeletedCompanyIdsByOwner,
  setCompanyModerationStatus,
} from "@/data/companies.js";
import { auditLog, members } from "@/data/schema/index.js";
import type { ListingCancellationDeps } from "@/modules/billing/listing-cancellation.js";
import type { ListingHoldDeps } from "@/modules/billing/listing-hold.js";
import { deleteCompanyForStaff } from "@/modules/catalogue/delete-company.js";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * FR-046 / data-storage.md §4: staff delete a company or a member.
 *
 * Stripe is a fake that records what was asked of it. A company with no hold
 * and no subscription asks Stripe for nothing, which is the case here; the
 * billing halves are the hide path's, tested in listing-hold and
 * listing-cancellation.
 */

function db(): DbClient {
  return getTestDb() as unknown as DbClient;
}

const NOW = new Date("2026-10-12T12:00:00.000Z");
const STAFF = { id: crypto.randomUUID(), role: "staff_admin" };

const stripeCalls: string[] = [];
const fakeDeps = {
  holds: () =>
    Promise.resolve(
      new Proxy({} as ListingHoldDeps, {
        get: (_target, name) => () => {
          stripeCalls.push(String(name));
          return Promise.resolve({});
        },
      }),
    ),
  cancellation: () =>
    Promise.resolve(
      new Proxy({} as ListingCancellationDeps, {
        get: (_target, name) => () => {
          stripeCalls.push(String(name));
          return Promise.resolve({});
        },
      }),
    ),
};

async function seedOwnerWithCompany(extra: { listingWaivedAt?: Date } = {}) {
  const [owner] = await db()
    .insert(members)
    .values({
      phone: `+15558${crypto.randomUUID().slice(0, 8)}`,
      passwordHash: "hash",
      displayName: "Owner To Delete",
      country: "US",
      language: "en",
      role: "member",
      status: "active",
      duesKind: "partner",
    })
    .returning();
  const companyId = await insertCompany(db(), {
    ownerId: owner!.id,
    name: "Deleted Co",
    slug: `deleted-co-${crypto.randomUUID().slice(0, 8)}`,
    moderationStatus: "approved",
    contactEmail: "owner@example.com",
    contactPhone: "+15550001111",
    ...extra,
  });
  return { ownerId: owner!.id, companyId };
}

describe("FR-046: staff delete a company", () => {
  it("FR-046: a deleted company leaves the catalogue and the console, and is audited", async () => {
    const { companyId } = await seedOwnerWithCompany({ listingWaivedAt: NOW });

    expect(
      await deleteCompanyForStaff(
        db(),
        companyId,
        STAFF,
        "Duplicate",
        NOW,
        fakeDeps,
      ),
    ).toBe(true);

    const company = await findCompanyById(db(), companyId);
    expect(company?.deletedAt).not.toBeNull();
    expect(company?.moderationStatus).toBe("rejected");
    expect(await listApprovedCompaniesByIds(db(), [companyId])).toEqual([]);

    const admin = await listCompaniesForAdmin(db(), { now: NOW });
    expect(admin.map((row) => row.id)).not.toContain(companyId);

    const entries = await db()
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.subjectId, companyId),
          eq(auditLog.action, "company.deleted"),
        ),
      );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.actorId).toBe(STAFF.id);
  });

  it("FR-046: a deleted company can never be approved or restored again", async () => {
    const { companyId } = await seedOwnerWithCompany({ listingWaivedAt: NOW });
    await deleteCompanyForStaff(db(), companyId, STAFF, "Spam", NOW, fakeDeps);

    expect(
      await setCompanyModerationStatus(db(), companyId, "approved", null),
    ).toBe(false);
    expect((await findCompanyById(db(), companyId))?.moderationStatus).toBe(
      "rejected",
    );
  });

  it("FR-046: deleting twice changes nothing and audits once", async () => {
    const { companyId } = await seedOwnerWithCompany();
    await deleteCompanyForStaff(db(), companyId, STAFF, "First", NOW, fakeDeps);

    expect(
      await deleteCompanyForStaff(
        db(),
        companyId,
        STAFF,
        "Again",
        NOW,
        fakeDeps,
      ),
    ).toBe(false);
    const entries = await db()
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.subjectId, companyId),
          eq(auditLog.action, "company.deleted"),
        ),
      );
    expect(entries).toHaveLength(1);
  });
});

describe("FR-009 / FR-046: staff record a member's deletion", () => {
  it("FR-046: the member is pending deletion, audited as staff with the reason", async () => {
    const { ownerId } = await seedOwnerWithCompany();

    await requestAccountDeletionTx(getTestDb() as unknown as Db, ownerId, [], {
      staffId: STAFF.id,
      staffRole: STAFF.role,
      reason: "Asked by phone",
    });

    const [member] = await db()
      .select()
      .from(members)
      .where(eq(members.id, ownerId));
    expect(member?.status).toBe("pending_deletion");

    const [entry] = await db()
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.subjectId, ownerId),
          eq(auditLog.action, "member.deletion_requested"),
        ),
      );
    expect(entry?.actorId).toBe(STAFF.id);
    expect(entry?.actorType).toBe("staff_admin");
    expect(entry?.meta).toMatchObject({
      by: "staff",
      reason: "Asked by phone",
    });
  });

  it("FR-009: erasure removes the owner's waived company from the catalogue and clears its contacts", async () => {
    const { ownerId, companyId } = await seedOwnerWithCompany({
      listingWaivedAt: NOW,
    });

    await eraseMemberTx(db(), ownerId, NOW);

    const company = await findCompanyById(db(), companyId);
    expect(company?.deletedAt).not.toBeNull();
    expect(company?.moderationStatus).toBe("rejected");
    expect(company?.contactEmail).toBeNull();
    expect(company?.contactPhone).toBeNull();
    expect(await listApprovedCompaniesByIds(db(), [companyId])).toEqual([]);
    expect(await listUndeletedCompanyIdsByOwner(db(), ownerId)).toEqual([]);
  });
});
