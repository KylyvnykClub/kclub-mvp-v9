"use server";

import { cookies } from "next/headers";
import { IdentityService } from "@/modules/identity";
import { db } from "@/data/db";
import { cards, members } from "@/data/schema";
import { eq } from "drizzle-orm";

/**
 * Retrieves the current authenticated member from the session cookie.
 * Returns null if unauthenticated or session is invalid.
 */
export async function getCurrentMember() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (!token) {
    return null;
  }

  const result = await IdentityService.authenticateSession(token);
  if (!result) {
    return null;
  }

  // Fetch the member's card
  const [memberCard] = await db
    .select()
    .from(cards)
    .where(eq(cards.memberId, result.member.id))
    .limit(1);

  return {
    member: result.member,
    session: result.session,
    card: memberCard ?? null,
  };
}

/**
 * Retrieves a card by its public token for the verification page.
 * Returns card + member display info (no sensitive data).
 */
export async function getCardByPublicToken(publicToken: string) {
  const rows = await db
    .select({
      serial: cards.serial,
      tier: cards.tier,
      status: cards.status,
      issuedAt: cards.issuedAt,
      memberName: members.displayName,
      memberCountry: members.country,
      memberStatus: members.status,
    })
    .from(cards)
    .innerJoin(members, eq(cards.memberId, members.id))
    .where(eq(cards.token, publicToken))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  return rows[0];
}
