import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * What tools/e2e-env.ts published about the environment it brought up.
 *
 * Read rather than recomputed: the fixture ids and the card token are decided
 * when the data is seeded, and a spec that derived them again would be testing
 * its own arithmetic.
 */
export interface E2eEnv {
  baseUrl: string;
  databaseUrl: string;
  memberId: string;
  vipId: string;
  cardToken: string;
  companySlug: string;
}

export function readE2eEnv(): E2eEnv {
  const path = join(process.cwd(), ".playwright", "e2e-env.json");

  try {
    return JSON.parse(readFileSync(path, "utf-8")) as E2eEnv;
  } catch {
    throw new Error(
      `Could not read ${path}. The e2e environment writes it at startup - run through 'pnpm test:e2e' rather than invoking playwright directly against an unmanaged server.`,
    );
  }
}

export const STORAGE_STATE = {
  member: join(process.cwd(), ".playwright", "member.json"),
  vip: join(process.cwd(), ".playwright", "vip.json"),
} as const;
