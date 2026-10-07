import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { eraseMemberTx } from "@/data/account-erasure.js";
import {
  findCompanyById,
  insertCompany,
  setCompanyModerationStatus,
} from "@/data/companies.js";
import type { Db, DbClient } from "@/data/db.js";
import { registerMemberTx } from "@/data/identity.js";
import {
  countInvitationsByInviter,
  ensureInviteLink,
  findActiveInviteLinkByCode,
  findActiveInviteLinkById,
  findInvitationOf,
  listActiveInviteLinks,
  loadInviterStanding,
  loadMemberInviteSummary,
  recordInvitation,
  rotateInviteLink,
} from "@/data/invite-links.js";
import { loadMembershipAccess } from "@/data/membership-access.js";
import {
  auditLog,
  companies,
  consentRecords,
  invitations,
  inviteLinks,
  members,
  subscriptions,
} from "@/data/schema/index.js";
import { inviteGrantsWaiver } from "@/domain/invites.js";
import {
  findListingActivation,
  findUnspentPartnerInvitation,
  hasPaymentAuthority,
} from "@/data/business-applications.js";
import {
  applicationTerms,
  paymentAuthorityWording,
  type ConsentKind,
} from "@/domain/business-application.js";
import { settleFiledApplication } from "@/modules/catalogue/application-consents.js";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * ADR 0042: members bring people in through personal links, and the club
 * records who brought whom. The Server Action that reads the cookie needs
 * Next's request scope; what it calls - the standing, the registration
 * transaction, the waiver - is exercised here against a real database.
 */

function db(): DbClient {
  return getTestDb() as unknown as DbClient;
}
function tx(): Db {
  return getTestDb() as unknown as Db;
}

const code = () => `c_${crypto.randomUUID()}`;
const now = () => new Date();

async function seedMember(
  duesKind: "paying" | "sponsored" | "partner" | "legacy_free" = "legacy_free",
  status: "active" | "blocked" = "active",
) {
  const [member] = await db()
    .insert(members)
    .values({
      phone: `+15557${crypto.randomUUID().replace(/\D/g, "").slice(0, 7)}`,
      passwordHash: "hash",
      displayName: "Inviter",
      country: "UA",
      language: "uk",
      role: "member",
      status,
      duesKind,
    })
    .returning();
  return member!;
}

async function giveSubscription(
  memberId: string,
  plan: "membership" | "vip",
  status = "active",
) {
  await db()
    .insert(subscriptions)
    .values({
      plan,
      stripeSubscriptionId: `sub_${crypto.randomUUID()}`,
      memberId,
      stripeCustomerId: `cus_${crypto.randomUUID()}`,
      status,
      priceId: `price_${plan}`,
      currentPeriodStart: new Date("2026-10-01T00:00:00Z"),
      currentPeriodEnd: new Date("2026-11-01T00:00:00Z"),
    });
}

async function seedPartnerWithLiveListing() {
  const partner = await seedMember("partner");
  const companyId = await insertCompany(db(), {
    ownerId: partner.id,
    name: "Live Co",
    slug: `live-${crypto.randomUUID().slice(0, 8)}`,
    moderationStatus: "pending",
  });
  await setCompanyModerationStatus(db(), companyId, "approved", null);
  await db()
    .insert(subscriptions)
    .values({
      plan: "listing",
      stripeSubscriptionId: `sub_${crypto.randomUUID()}`,
      memberId: partner.id,
      companyId,
      stripeCustomerId: `cus_${crypto.randomUUID()}`,
      status: "active",
      priceId: "price_listing",
      currentPeriodStart: new Date("2026-10-01T00:00:00Z"),
      currentPeriodEnd: new Date("2026-11-01T00:00:00Z"),
    });
  return partner;
}

async function seedPartnerWithWaivedListing() {
  const partner = await seedMember("partner");
  const companyId = await insertCompany(db(), {
    ownerId: partner.id,
    name: "Free Co",
    slug: `free-${crypto.randomUUID().slice(0, 8)}`,
    moderationStatus: "pending",
  });
  await db()
    .update(companies)
    .set({ listingWaivedAt: now() })
    .where(eq(companies.id, companyId));
  await setCompanyModerationStatus(db(), companyId, "approved", null);
  return partner;
}

/** What `registerMemberFromForm` does once the cookie is proved. */
async function registerThrough(
  linkCode: string,
  options: { partnerAccount?: boolean } = {},
) {
  const link = await findActiveInviteLinkByCode(db(), linkCode);
  const standing = link
    ? await loadInviterStanding(db(), link.ownerMemberId, now())
    : null;
  const invitation =
    link && standing
      ? {
          inviterMemberId: link.ownerMemberId,
          inviteLinkId: link.id,
          kind: link.kind,
          inviterStanding: standing,
          waived:
            inviteGrantsWaiver(standing, link.kind) &&
            !(link.kind === "member" && options.partnerAccount),
        }
      : undefined;
  const duesKind = options.partnerAccount
    ? ("partner" as const)
    : invitation?.kind === "member" && invitation.waived
      ? ("sponsored" as const)
      : ("paying" as const);

  const phone = `+15558${crypto.randomUUID().replace(/\D/g, "").slice(0, 7)}`;
  const memberId = await registerMemberTx(db(), {
    phone,
    email: null,
    passwordHash: "hash",
    displayName: "Newcomer",
    country: "UA",
    language: "uk",
    duesKind,
    invitation,
    userAgent: "test",
    ipAddress: "127.0.0.1",
    consents: [],
    cardSerial: `KCLUB-I${crypto.randomUUID().slice(0, 6)}`,
    sessionToken: crypto.randomUUID(),
  });
  const member = await db().query.members.findFirst({
    where: eq(members.id, memberId),
  });
  return member!;
}

async function linkOf(ownerId: string, kind: "member" | "partner") {
  await ensureInviteLink(db(), ownerId, kind, code());
  const links = await listActiveInviteLinks(db(), ownerId);
  return links.find((link) => link.kind === kind)!;
}

describe("FR-122: one live invite link of each kind per member", () => {
  it("FR-122: hangs a link once, however many times it is asked", async () => {
    const owner = await seedMember();
    await ensureInviteLink(db(), owner.id, "member", code());
    await ensureInviteLink(db(), owner.id, "member", code());
    await ensureInviteLink(db(), owner.id, "partner", code());

    const links = await listActiveInviteLinks(db(), owner.id);
    expect(links.map((link) => link.kind).sort()).toEqual([
      "member",
      "partner",
    ]);
  });

  it("FR-122: rotating retires the old code at once and leaves the other kind", async () => {
    const owner = await seedMember();
    const member = await linkOf(owner.id, "member");
    const partner = await linkOf(owner.id, "partner");

    const next = await rotateInviteLink(
      tx(),
      owner.id,
      "member",
      code(),
      now(),
    );

    expect(await findActiveInviteLinkByCode(db(), member.code)).toBeNull();
    expect(await findActiveInviteLinkById(db(), member.id)).toBeNull();
    expect((await findActiveInviteLinkByCode(db(), next.code))?.id).toBe(
      next.id,
    );
    expect((await findActiveInviteLinkById(db(), partner.id))?.id).toBe(
      partner.id,
    );
  });

  it("FR-122: the database refuses a second live link of one kind", async () => {
    const owner = await seedMember();
    await linkOf(owner.id, "member");

    await expect(
      db()
        .insert(inviteLinks)
        .values({ ownerMemberId: owner.id, kind: "member", code: code() }),
    ).rejects.toThrow();
  });
});

describe("FR-123: the inviter's standing is read from the database now", () => {
  it("FR-123: a club member with dues is a member", async () => {
    const inviter = await seedMember("paying");
    await giveSubscription(inviter.id, "membership");
    expect(await loadInviterStanding(db(), inviter.id, now())).toBe("member");
  });

  it("FR-123: an active VIP subscription makes a VIP", async () => {
    const inviter = await seedMember("paying");
    await giveSubscription(inviter.id, "membership");
    await giveSubscription(inviter.id, "vip");
    expect(await loadInviterStanding(db(), inviter.id, now())).toBe("vip");
  });

  it("FR-123: an approved paid listing makes a business partner", async () => {
    const partner = await seedPartnerWithLiveListing();
    expect(await loadInviterStanding(db(), partner.id, now())).toBe("partner");
  });

  it("FR-123: a partner whose listing was waived, not paid, is a club member - a free listing never hands out free memberships", async () => {
    const partner = await seedPartnerWithWaivedListing();
    expect(await loadInviterStanding(db(), partner.id, now())).toBe("member");
  });

  it("FR-123: an unpaid, a blocked and an erased inviter have no standing", async () => {
    const unpaid = await seedMember("paying");
    const blocked = await seedMember("legacy_free", "blocked");
    const erased = await seedMember("legacy_free");
    await eraseMemberTx(db(), erased.id, now());

    expect(await loadInviterStanding(db(), unpaid.id, now())).toBeNull();
    expect(await loadInviterStanding(db(), blocked.id, now())).toBeNull();
    expect(await loadInviterStanding(db(), erased.id, now())).toBeNull();
  });
});

describe("FR-123, FR-124: registration records who brought the newcomer", () => {
  it("FR-124: a VIP's member link makes a sponsored member who is in without paying", async () => {
    const vip = await seedMember("paying");
    await giveSubscription(vip.id, "membership");
    await giveSubscription(vip.id, "vip");
    const link = await linkOf(vip.id, "member");

    const newcomer = await registerThrough(link.code);

    expect(newcomer.duesKind).toBe("sponsored");
    expect(await loadMembershipAccess(db(), newcomer, now())).toBe("active");
    const invitation = await findInvitationOf(db(), newcomer.id);
    expect(invitation).toMatchObject({
      inviterMemberId: vip.id,
      inviteLinkId: link.id,
      kind: "member",
      inviterStanding: "vip",
      waived: true,
    });
  });

  it("FR-124: a business partner's member link sponsors too", async () => {
    const partner = await seedPartnerWithLiveListing();
    const link = await linkOf(partner.id, "member");

    const newcomer = await registerThrough(link.code);

    expect(newcomer.duesKind).toBe("sponsored");
    expect((await findInvitationOf(db(), newcomer.id))?.inviterStanding).toBe(
      "partner",
    );
  });

  it("FR-124: a club member's member link is recorded, and the newcomer pays", async () => {
    const inviter = await seedMember("legacy_free");
    const link = await linkOf(inviter.id, "member");

    const newcomer = await registerThrough(link.code);

    expect(newcomer.duesKind).toBe("paying");
    expect(await loadMembershipAccess(db(), newcomer, now())).toBe(
      "awaiting_payment",
    );
    expect(await findInvitationOf(db(), newcomer.id)).toMatchObject({
      inviterMemberId: inviter.id,
      inviterStanding: "member",
      waived: false,
    });
  });

  it("FR-123: a link whose owner is outside the club records nothing and waives nothing", async () => {
    const lapsed = await seedMember("paying");
    const link = await linkOf(lapsed.id, "member");

    const newcomer = await registerThrough(link.code);

    expect(newcomer.duesKind).toBe("paying");
    expect(await findInvitationOf(db(), newcomer.id)).toBeNull();
  });

  it("FR-123: a rotated code records nothing", async () => {
    const vip = await seedMember("legacy_free");
    await giveSubscription(vip.id, "vip");
    const link = await linkOf(vip.id, "member");
    await rotateInviteLink(tx(), vip.id, "member", code(), now());

    const newcomer = await registerThrough(link.code);

    expect(newcomer.duesKind).toBe("paying");
    expect(await findInvitationOf(db(), newcomer.id)).toBeNull();
  });

  it("FR-123: an invitee is recorded once; a second attribution does nothing", async () => {
    const first = await seedMember();
    const second = await seedMember();
    const link = await linkOf(first.id, "member");
    const other = await linkOf(second.id, "member");
    const newcomer = await registerThrough(link.code);

    await recordInvitation(db(), {
      inviteeMemberId: newcomer.id,
      inviterMemberId: second.id,
      inviteLinkId: other.id,
      kind: "member",
      inviterStanding: "member",
      waived: false,
    });

    expect((await findInvitationOf(db(), newcomer.id))?.inviterMemberId).toBe(
      first.id,
    );
  });

  it("FR-123: the database refuses a member brought by themselves", async () => {
    const member = await seedMember();
    await expect(
      db().insert(invitations).values({
        inviteeMemberId: member.id,
        inviterMemberId: member.id,
        kind: "member",
        inviterStanding: "member",
        waived: false,
      }),
    ).rejects.toThrow();
  });
});

describe("FR-124, ADR 0044: a partner invite link gives one free month from publication", () => {
  async function partnerBroughtBy(
    inviterDuesKind: "legacy_free" = "legacy_free",
  ) {
    const inviter = await seedMember(inviterDuesKind);
    const link = await linkOf(inviter.id, "partner");
    const newcomer = await registerThrough(link.code, { partnerAccount: true });
    return { inviter, link, newcomer };
  }

  async function fileApplication(ownerId: string) {
    return insertCompany(db(), {
      ownerId,
      name: "Brought Co",
      slug: `brought-${crypto.randomUUID().slice(0, 8)}`,
      moderationStatus: "pending",
    });
  }

  /**
   * What `resolveApplication` decides, without the request scope it needs
   * for the club-link cookie (absent here).
   */
  async function resolvedFor(memberId: string) {
    const invitation = await findUnspentPartnerInvitation(db(), memberId);
    const terms = applicationTerms({
      invited: invitation !== undefined,
      residenceCountry: "US",
      earlyStartRequested: false,
      now: now(),
    });
    return {
      terms,
      wording: paymentAuthorityWording(terms),
      inviteLinkId: invitation?.inviteLinkId ?? null,
    };
  }

  const ALL_REQUIRED = new Set<ConsentKind>([
    "terms",
    "payment_authority",
    "publication",
  ]);

  async function settle(memberId: string, companyId: string) {
    await settleFiledApplication(tx(), {
      memberId,
      companyId,
      residenceCountry: "US",
      locale: "ru",
      ticked: ALL_REQUIRED,
      resolved: await resolvedFor(memberId),
      now: now(),
    });
  }

  it("FR-124: the first application is on the invite route, with a saved-card activation and no permanent waiver", async () => {
    const { link, newcomer } = await partnerBroughtBy();
    expect(newcomer.duesKind).toBe("partner");
    const companyId = await fileApplication(newcomer.id);

    await settle(newcomer.id, companyId);

    const company = await findCompanyById(db(), companyId);
    expect(company?.applicationRoute).toBe("invite");
    expect(company?.applicationInviteLinkId).toBe(link.id);
    expect(company?.listingWaivedAt).toBeNull();

    const activation = await findListingActivation(db(), companyId);
    expect(activation?.freeMonth).toBe(true);
    expect(activation?.cardSavedAt).toBeNull();

    expect(
      (await findInvitationOf(db(), newcomer.id))?.waiverUsedAt,
    ).toBeInstanceOf(Date);

    const entries = await db()
      .select()
      .from(auditLog)
      .where(eq(auditLog.subjectId, companyId));
    expect(entries.map((entry) => entry.action)).toContain(
      "company.application_terms",
    );
  });

  it("ADR 0044: records each ticked box with the full Russian text, the wording and the version", async () => {
    const { newcomer } = await partnerBroughtBy();
    const companyId = await fileApplication(newcomer.id);
    await settle(newcomer.id, companyId);

    const records = await db()
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.companyId, companyId));
    expect(records.map((record) => record.kind).sort()).toEqual([
      "payment_authority",
      "publication",
      "terms",
    ]);
    const payment = records.find((r) => r.kind === "payment_authority");
    expect(payment?.wording).toBe("invite");
    expect(payment?.route).toBe("invite");
    expect(payment?.text).toContain(
      "Ожидание одобрения не входит в бесплатный месяц",
    );
    expect(payment?.textHash).toHaveLength(64);
    expect(
      await hasPaymentAuthority(db(), companyId, newcomer.id, "invite"),
    ).toBe(true);
    expect(
      await hasPaymentAuthority(db(), companyId, newcomer.id, "public_hold"),
    ).toBe(false);
  });

  it("FR-124: a second application gets no free month - it is on the public route", async () => {
    const { newcomer } = await partnerBroughtBy();
    await settle(newcomer.id, await fileApplication(newcomer.id));

    const second = await fileApplication(newcomer.id);
    await settle(newcomer.id, second);

    expect((await findCompanyById(db(), second))?.applicationRoute).toBe(
      "public",
    );
    expect(await findListingActivation(db(), second)).toBeNull();
  });

  it("ADR 0044: without the required boxes nothing is recorded and the invitation is not spent", async () => {
    const { newcomer } = await partnerBroughtBy();
    const companyId = await fileApplication(newcomer.id);

    await expect(
      settleFiledApplication(tx(), {
        memberId: newcomer.id,
        companyId,
        residenceCountry: "US",
        locale: "en",
        ticked: new Set<ConsentKind>(["terms"]),
        resolved: await resolvedFor(newcomer.id),
        now: now(),
      }),
    ).rejects.toThrow();

    expect(
      (await findInvitationOf(db(), newcomer.id))?.waiverUsedAt,
    ).toBeNull();
    expect(await findListingActivation(db(), companyId)).toBeNull();
  });

  it("FR-124: a member brought through a member link has no free business month", async () => {
    const vip = await seedMember("legacy_free");
    await giveSubscription(vip.id, "vip");
    const link = await linkOf(vip.id, "member");
    const newcomer = await registerThrough(link.code);

    expect(
      await findUnspentPartnerInvitation(db(), newcomer.id),
    ).toBeUndefined();
  });
});

describe("FR-125, FR-126: the inviter sees counts, staff see who", () => {
  it("FR-125: counts by kind, and nothing else", async () => {
    const inviter = await seedMember();
    const memberLink = await linkOf(inviter.id, "member");
    const partnerLink = await linkOf(inviter.id, "partner");
    await registerThrough(memberLink.code);
    await registerThrough(memberLink.code);
    await registerThrough(partnerLink.code, { partnerAccount: true });

    const counts = await countInvitationsByInviter(db(), inviter.id);
    expect(counts).toEqual({ member: 2, partner: 1 });
  });

  it("FR-126: the console names the inviter and how the newcomer came", async () => {
    const inviter = await seedMember();
    const link = await linkOf(inviter.id, "member");
    const newcomer = await registerThrough(link.code);

    const summary = await loadMemberInviteSummary(db(), newcomer.id);
    expect(summary.invitedBy).toMatchObject({
      inviterMemberId: inviter.id,
      inviterDisplayName: "Inviter",
      kind: "member",
      waived: false,
    });
    expect((await loadMemberInviteSummary(db(), inviter.id)).brought).toEqual({
      member: 1,
      partner: 0,
    });
  });
});

describe("ADR 0042: erasure leaves no trail of who brought whom", () => {
  it("FR-009: erasing an invitee deletes their invitation; erasing an inviter forgets them", async () => {
    const inviter = await seedMember();
    const link = await linkOf(inviter.id, "member");
    const kept = await registerThrough(link.code);
    const erased = await registerThrough(link.code);

    await eraseMemberTx(db(), erased.id, now());
    expect(await findInvitationOf(db(), erased.id)).toBeNull();

    await eraseMemberTx(db(), inviter.id, now());
    expect(await findInvitationOf(db(), kept.id)).toMatchObject({
      inviterMemberId: null,
    });
    expect(await listActiveInviteLinks(db(), inviter.id)).toEqual([]);
  });
});
