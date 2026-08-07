import { eq } from "drizzle-orm";

import type { DbClient } from "./db";
import { featureFlag } from "./schema/feature-flag";

export type FlagName =
  | "signup_enabled"
  | "sms_enabled"
  | "referrals_enabled"
  | "checkout_enabled"
  | "maintenance_mode"
  | "public_catalogue";

export const FLAG_NAMES: readonly FlagName[] = [
  "signup_enabled",
  "sms_enabled",
  "referrals_enabled",
  "checkout_enabled",
  "maintenance_mode",
  "public_catalogue",
];

export function isFlagName(name: string): name is FlagName {
  return (FLAG_NAMES as readonly string[]).includes(name);
}

export async function isEnabled(
  db: DbClient,
  name: FlagName,
): Promise<boolean> {
  const rows = await db
    .select({ enabled: featureFlag.enabled })
    .from(featureFlag)
    .where(eq(featureFlag.name, name))
    .limit(1);

  return rows[0]?.enabled ?? false;
}

export async function setFlag(
  db: DbClient,
  name: FlagName,
  enabled: boolean,
): Promise<void> {
  await db
    .update(featureFlag)
    .set({ enabled })
    .where(eq(featureFlag.name, name));
}

export async function upsertFlag(
  db: DbClient,
  name: FlagName,
  enabled: boolean,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(featureFlag)
    .where(eq(featureFlag.name, name))
    .limit(1);

  if (existing) {
    await db
      .update(featureFlag)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(featureFlag.name, name));
  } else {
    await db.insert(featureFlag).values({ name, enabled });
  }
}

export async function allFlags(
  db: DbClient,
): Promise<Record<FlagName, boolean>> {
  const rows = await db.select().from(featureFlag);
  const result = {} as Record<FlagName, boolean>;
  for (const row of rows) {
    result[row.name as FlagName] = row.enabled;
  }
  return result;
}

export async function listFlagRows(db: DbClient) {
  return db.select().from(featureFlag);
}

export type FlagRow = Awaited<ReturnType<typeof listFlagRows>>[number];
