"use server";

import { db } from "@/data/db";
import {
  countApprovedCompaniesByIds,
  listCompanyIdsWithActiveSubscription,
  listPartnerCountryCodes,
} from "@/data/companies";
import { countMemberPresence } from "@/data/members";
import type { ClubPresence } from "@/lib/club-stats";

const SKIP_DB_PRERENDER = process.env.KCLUB_SKIP_DB_PRERENDER === "1";

/**
 * How large the club actually is: members, published partners, and the
 * countries those partners are registered in. Three integers and nothing else -
 * no row about any member leaves this function, so the landing page can say how
 * many there are without the page becoming a way to find out who they are
 * (ADR 0005).
 *
 * `countries` counts partner countries rather than member countries, because
 * the band renders it directly above the partner flags: two different figures
 * under one heading and one row of flags is the kind of detail nobody catches
 * and everybody misreads.
 *
 * The counts are deliberately the real ones. A landing counter was removed
 * once already for overstating the club, and the reference design that asked
 * for this band filled it with invented figures; `MIN_STAT_TO_SHOW` is the
 * compromise that lets the band exist without either lying or announcing that
 * the club has three members.
 */
export async function getClubPresenceAction(): Promise<ClubPresence> {
  if (SKIP_DB_PRERENDER) {
    return { members: 0, countries: 0, partners: 0 };
  }

  const activeCompanyIds = await listCompanyIdsWithActiveSubscription(db);

  const [presence, partners, countryCodes] = await Promise.all([
    countMemberPresence(db),
    activeCompanyIds.length === 0
      ? Promise.resolve(0)
      : countApprovedCompaniesByIds(db, activeCompanyIds),
    activeCompanyIds.length === 0
      ? Promise.resolve([] as string[])
      : listPartnerCountryCodes(db, activeCompanyIds),
  ]);

  return {
    members: presence.members,
    countries: countryCodes.length,
    partners,
  };
}
