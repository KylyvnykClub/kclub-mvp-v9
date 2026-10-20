import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { Db, DbClient } from "@/data/db.js";
import { registerMemberTx } from "@/data/identity.js";
import {
  findActiveJoinLink,
  findActiveJoinLinkById,
  revokeActiveJoinLink,
  rotateJoinLink,
} from "@/data/join-links.js";
import { cards, members } from "@/data/schema/index.js";
import { joinLinkGrant } from "@/domain/join-link.js";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * ADR 0048: the owner's VIP join link. A third door beside the member and the
 * partner links: registering through it makes a sponsored member whose first
 * card is VIP, which the owner used to do by hand afterwards.
 */

function db(): DbClient {
  return getTestDb() as unknown as DbClient;
}
function tx(): Db {
  return getTestDb() as unknown as Db;
}

beforeAll(() => {
  process.env["BETTER_AUTH_SECRET"] ??= "integration-vip-join-secret";
});

const secret = () => `s_${crypto.randomUUID()}`;
let seq = 0;

async function registerThrough(kind: "member" | "vip" | null) {
  seq += 1;
  const phone = `+3806030${String(1000 + seq).slice(-4)}`;
  const grant = joinLinkGrant(kind, "member");
  await registerMemberTx(db(), {
    phone,
    email: null,
    passwordHash: "argon2id$hash",
    displayName: "Joined Member",
    country: "UA",
    language: "uk",
    duesKind: grant.sponsored ? "sponsored" : "paying",
    cardTier: grant.cardTier,
    userAgent: "test",
    ipAddress: "127.0.0.1",
    consents: [],
    sessionToken: crypto.randomUUID(),
  });
  const member = (await db().query.members.findFirst({
    where: eq(members.phone, phone),
  }))!;
  const [card] = await db()
    .select()
    .from(cards)
    .where(eq(cards.memberId, member.id));
  return { member, card: card! };
}

describe("FR-106: the VIP link is a door of its own", () => {
  it("FR-106: rotating or revoking the VIP link leaves the member link open", async () => {
    const member = await rotateJoinLink(tx(), "member", secret(), null);
    const vip = await rotateJoinLink(tx(), "vip", secret(), null);

    expect((await findActiveJoinLink(db(), "member"))?.id).toBe(member.id);
    expect((await findActiveJoinLink(db(), "vip"))?.id).toBe(vip.id);

    const nextVip = await rotateJoinLink(tx(), "vip", secret(), null);
    expect(await findActiveJoinLinkById(db(), vip.id)).toBeNull();
    expect((await findActiveJoinLink(db(), "vip"))?.id).toBe(nextVip.id);

    await revokeActiveJoinLink(tx(), "vip");
    expect(await findActiveJoinLink(db(), "vip")).toBeNull();
    expect((await findActiveJoinLink(db(), "member"))?.id).toBe(member.id);
  });
});

describe("FR-105 / ADR 0048: what registering through each link creates", () => {
  it("ADR 0048: through the VIP link, a sponsored member with a VIP card", async () => {
    const { member, card } = await registerThrough("vip");
    expect(member.duesKind).toBe("sponsored");
    expect(card.tier).toBe("vip");
    expect(card.status).toBe("valid");
  });

  it("FR-105: through the member link, a sponsored member with a free card", async () => {
    const { member, card } = await registerThrough("member");
    expect(member.duesKind).toBe("sponsored");
    expect(card.tier).toBe("free");
  });

  it("FR-105: with no link, a paying member with a free card", async () => {
    const { member, card } = await registerThrough(null);
    expect(member.duesKind).toBe("paying");
    expect(card.tier).toBe("free");
  });
});
