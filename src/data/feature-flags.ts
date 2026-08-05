import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { featureFlag } from "./schema/feature-flag";

export type FlagName =
  | "signup_enabled"
  | "sms_enabled"
  | "referrals_enabled"
  | "checkout_enabled"
  | "maintenance_mode";

export async function isEnabled(
  db: NodePgDatabase,
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
  db: NodePgDatabase,
  name: FlagName,
  enabled: boolean,
): Promise<void> {
  await db
    .update(featureFlag)
    .set({ enabled })
    .where(eq(featureFlag.name, name));
}

export async function allFlags(
  db: NodePgDatabase,
): Promise<Record<FlagName, boolean>> {
  const rows = await db.select().from(featureFlag);
  const result = {} as Record<FlagName, boolean>;
  for (const row of rows) {
    result[row.name as FlagName] = row.enabled;
  }
  return result;
}
