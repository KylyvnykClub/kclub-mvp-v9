"use server";

import { cookies } from "next/headers";
import { IdentityService } from "@/modules/identity";
import { db } from "@/data/db";
import { findCardByMemberId, findCardPublicByToken } from "@/data/members";

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

  const memberCard = await findCardByMemberId(db, result.member.id);

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
  return findCardPublicByToken(db, publicToken);
}
