import { env } from "@/env";

/**
 * City names for one country from the CountryStateCity API (ADR 0025).
 *
 * Called from a Server Action only: the key travels in a request header, so
 * it can never reach the browser. Results are cached in process memory per
 * country - reference data that changes on a geological timescale, and a
 * single country's list is at most a few hundred kilobytes.
 *
 * Returns null when the key is not configured, so every environment without
 * one (CI, a fresh clone) degrades to a free-text city field rather than a
 * broken form.
 */

const API_BASE = "https://api.countrystatecity.in/v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

const cache = new Map<string, { names: string[]; expiresAt: number }>();

export function isCityLookupConfigured(): boolean {
  return Boolean(env.server.COUNTRY_STATE_CITY_API_KEY);
}

export async function listCityNames(
  countryCode: string,
): Promise<string[] | null> {
  const key = env.server.COUNTRY_STATE_CITY_API_KEY;
  if (!key) return null;

  const iso2 = countryCode.toUpperCase();
  const cached = cache.get(iso2);
  if (cached && cached.expiresAt > Date.now()) return cached.names;

  const response = await fetch(`${API_BASE}/countries/${iso2}/cities`, {
    headers: { "X-CSCAPI-KEY": key },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`CountryStateCity responded ${response.status}`);
  }

  const rows = (await response.json()) as { name?: unknown }[];
  const names = [
    ...new Set(
      rows
        .map((r) => (typeof r.name === "string" ? r.name.trim() : ""))
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));

  cache.set(iso2, { names, expiresAt: Date.now() + CACHE_TTL_MS });
  return names;
}
