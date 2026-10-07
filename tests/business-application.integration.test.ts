import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { findLapsedSubscriptions } from "@/data/billing.js";
import {
  countInviteTrialFunnel,
  deleteExpiredConsentRecords,
  insertConsentRecords,
  insertListingActivation,
  listActivationsDueForStart,
  setApplicationRoute,
  withdrawCompany,
} from "@/data/business-applications.js";
import {
  insertCompany,
  listCompanyIdsWithPaidListing,
  memberOwnsPaidListing,
  setCompanyModerationStatus,
} from "@/data/companies.js";
import type { DbClient } from "@/data/db.js";
import {
  consentRecords,
  listingActivations,
  members,
  subscriptions,
} from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * ADR 0044 against a real database: the rules that live in SQL - who may be
 * approved, what a free month publishes, what the sweeps pick up, what the
 * owner's counters count, and how long consent evidence is kept.
 */

function db(): DbClient {
  return getTestDb() as unknown as DbClient;
}
const now = () => new Date();

async function seedPartner() {
  const [member] = await db()
    .insert(members)
    .values({
      phone: `+15558${crypto.randomUUID().replace(/\D/g, "").slice(0, 7)}`,
      passwordHash: "hash",
      displayName: "Partner",
      country: "US",
      language: "en",
      role: "member",
      duesKind: "partner",
    })
    .returning();
  return member!;
}

async function seedApplication(ownerId: string) {
  return insertCompany(db(), {
    ownerId,
    name: "Applied Co",
    slug: `applied-${crypto.randomUUID().slice(0, 8)}`,
    moderationStatus: "pending",
  });
}

async function listingSubscription(
  memberId: string,
  companyId: string,
  status: string,
  periodEnd = new Date(Date.now() + 20 * 86_400_000),
) {
  const id = `sub_${crypto.randomUUID()}`;
  await db()
    .insert(subscriptions)
    .values({
      plan: "listing",
      stripeSubscriptionId: id,
      memberId,
      companyId,
      stripeCustomerId: `cus_${crypto.randomUUID()}`,
      status,
      priceId: "price_listing",
      currentPeriodStart: new Date(Date.now() - 10 * 86_400_000),
      currentPeriodEnd: periodEnd,
    });
  return id;
}

describe("ADR 0044: a saved card is ready for review; a withdrawal is final", () => {
  it("lets a moderator approve an application whose card is saved", async () => {
    const partner = await seedPartner();
    const companyId = await seedApplication(partner.id);
    await insertListingActivation(db(), {
      companyId,
      memberId: partner.id,
      route: "invite",
      freeMonth: true,
    });

    // No card yet: not approvable.
    expect(
      await setCompanyModerationStatus(db(), companyId, "approved", null, {
        kind: "capturable_hold",
        now: now(),
      }),
    ).toBe(false);

    await db()
      .update(listingActivations)
      .set({ cardSavedAt: now(), paymentMethodId: "pm_1" })
      .where(eq(listingActivations.companyId, companyId));

    expect(
      await setCompanyModerationStatus(db(), companyId, "approved", null, {
        kind: "capturable_hold",
        now: now(),
      }),
    ).toBe(true);
  });

  it("never approves or restores an application its owner withdrew", async () => {
    const partner = await seedPartner();
    const companyId = await seedApplication(partner.id);
    await insertListingActivation(db(), {
      companyId,
      memberId: partner.id,
      route: "invite",
      freeMonth: true,
      cardSavedAt: now(),
      paymentMethodId: "pm_1",
    });

    expect(
      await withdrawCompany(db(), {
        companyId,
        ownerId: partner.id,
        now: now(),
        pendingOnly: true,
        reason: "Withdrawn by the applicant",
      }),
    ).toBe(true);

    for (const kind of ["capturable_hold", "restorable"] as const) {
      expect(
        await setCompanyModerationStatus(db(), companyId, "approved", null, {
          kind,
          now: now(),
        }),
      ).toBe(false);
    }
    expect(await listActivationsDueForStart(db(), now())).not.toContain(
      companyId,
    );
  });

  it("only the owner can withdraw, and only once", async () => {
    const partner = await seedPartner();
    const stranger = await seedPartner();
    const companyId = await seedApplication(partner.id);
    const input = {
      companyId,
      now: now(),
      pendingOnly: true,
      reason: "x",
    };
    expect(
      await withdrawCompany(db(), { ...input, ownerId: stranger.id }),
    ).toBe(false);
    expect(await withdrawCompany(db(), { ...input, ownerId: partner.id })).toBe(
      true,
    );
    expect(await withdrawCompany(db(), { ...input, ownerId: partner.id })).toBe(
      false,
    );
  });
});

describe("ADR 0044 §3: a free month publishes, but is never money", () => {
  it("publishes a trialing listing", async () => {
    const partner = await seedPartner();
    const companyId = await seedApplication(partner.id);
    await setCompanyModerationStatus(db(), companyId, "approved", null);
    await listingSubscription(partner.id, companyId, "trialing");

    expect(await listCompanyIdsWithPaidListing(db(), now())).toContain(
      companyId,
    );
  });

  it("does not make its owner a paying business partner for the invite matrix", async () => {
    const partner = await seedPartner();
    const companyId = await seedApplication(partner.id);
    await setCompanyModerationStatus(db(), companyId, "approved", null);
    await listingSubscription(partner.id, companyId, "trialing");

    expect(await memberOwnsPaidListing(db(), partner.id, now())).toBe(false);
  });

  it("is picked up by the lapse sweep once its period has ended", async () => {
    const partner = await seedPartner();
    const companyId = await seedApplication(partner.id);
    const id = await listingSubscription(
      partner.id,
      companyId,
      "trialing",
      new Date(Date.now() - 86_400_000),
    );

    expect(
      (await findLapsedSubscriptions(db(), now())).map(
        (row) => row.stripeSubscriptionId,
      ),
    ).toContain(id);
  });
});

describe("ADR 0044 §5: an EU consumer's start waits for 14 days", () => {
  it("is not due before its start date and is due after", async () => {
    const partner = await seedPartner();
    const companyId = await seedApplication(partner.id);
    await setCompanyModerationStatus(db(), companyId, "approved", null);
    const startNotBefore = new Date(Date.now() + 5 * 86_400_000);
    await insertListingActivation(db(), {
      companyId,
      memberId: partner.id,
      route: "public",
      freeMonth: false,
      startNotBefore,
      paymentMethodId: "pm_1",
      cardSavedAt: now(),
    });

    expect(await listActivationsDueForStart(db(), now())).not.toContain(
      companyId,
    );
    expect(
      await listActivationsDueForStart(
        db(),
        new Date(startNotBefore.getTime() + 1),
      ),
    ).toContain(companyId);
  });
});

describe("ADR 0044 §2, §7: evidence and counters", () => {
  it("keeps consent evidence six years and deletes it after", async () => {
    const partner = await seedPartner();
    const companyId = await seedApplication(partner.id);
    const record = (acceptedAt: Date) => ({
      memberId: partner.id,
      companyId,
      kind: "terms" as const,
      route: "public" as const,
      textVersion: "test",
      textHash: "0".repeat(64),
      text: "I accept",
      locale: "en",
      acceptedAt,
    });
    const old = new Date();
    old.setUTCFullYear(old.getUTCFullYear() - 6);
    old.setUTCDate(old.getUTCDate() - 1);
    await insertConsentRecords(db(), [record(old), record(now())]);

    expect(
      await deleteExpiredConsentRecords(db(), now()),
    ).toBeGreaterThanOrEqual(1);
    const left = await db()
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.companyId, companyId));
    expect(left).toHaveLength(1);
  });

  it("counts the invite route step by step", async () => {
    const before = await countInviteTrialFunnel(db());
    const partner = await seedPartner();
    const companyId = await seedApplication(partner.id);
    await setApplicationRoute(db(), companyId, "invite", null);
    await setCompanyModerationStatus(db(), companyId, "approved", null);
    const subscriptionId = await listingSubscription(
      partner.id,
      companyId,
      "trialing",
    );
    await insertListingActivation(db(), {
      companyId,
      memberId: partner.id,
      route: "invite",
      freeMonth: true,
      publishedAt: now(),
      stripeSubscriptionId: subscriptionId,
    });

    const after = await countInviteTrialFunnel(db());
    expect(after.applied - before.applied).toBe(1);
    expect(after.approved - before.approved).toBe(1);
    expect(after.activated - before.activated).toBe(1);
    expect(after.firstPaid - before.firstPaid).toBe(0);
    expect(after.activeNow - before.activeNow).toBe(1);
  });
});
