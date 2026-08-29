"use server";

import { z } from "zod";

import { getCurrentMember } from "@/actions/session";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import { listCityNames } from "@/modules/platform/country-state-city";

/**
 * City names for the onboarding form's city picker (ADR 0025).
 *
 * Null means "no lookup available" - the key is not configured, or the
 * provider is down - and the form falls back to a free-text field. Never an
 * error to the applicant: a reference-data hiccup must not block a
 * submission that FR-041 validates server-side anyway.
 */
export async function listCitiesForCountryAction(
  countryCode: string,
): Promise<string[] | null> {
  const auth = await getCurrentMember();
  if (!auth?.member) return null;
  if (!can(buildActor(auth.member), "create", "own_company")) return null;

  const parsed = z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .safeParse(countryCode);
  if (!parsed.success) return null;

  try {
    return await listCityNames(parsed.data);
  } catch (err) {
    console.error(
      `[cities] lookup failed for ${parsed.data}: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
    return null;
  }
}
