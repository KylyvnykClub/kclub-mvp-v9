"use server";

import { db } from "@/data/db";
import {
  isEnabled,
  isFlagName,
  listFlagRows,
  upsertFlag,
  type FlagName,
} from "@/data/feature-flags";
import { getCurrentMember } from "./session";
import { revalidatePath } from "next/cache";

export async function isFeatureEnabled(name: FlagName): Promise<boolean> {
  return isEnabled(db, name);
}

function assertFlagName(name: string): FlagName {
  if (!isFlagName(name)) {
    throw new Error(`Unknown feature flag: ${name}`);
  }
  return name;
}

export async function toggleFeatureFlagAction(name: string, enabled: boolean) {
  const auth = await getCurrentMember();
  if (!auth?.member || auth.member.role !== "admin") {
    throw new Error("Unauthorized");
  }

  const flagName = assertFlagName(name);
  await upsertFlag(db, flagName, enabled);

  revalidatePath("/dashboard/admin/flags");
  revalidatePath("/partners");
}

export async function getFeatureFlagsAction() {
  const auth = await getCurrentMember();
  if (!auth?.member || auth.member.role !== "admin") {
    throw new Error("Unauthorized");
  }

  return listFlagRows(db);
}
