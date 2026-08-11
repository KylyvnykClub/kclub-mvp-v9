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
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import { revalidatePath } from "next/cache";

export async function isFeatureEnabled(name: FlagName): Promise<boolean> {
  if (
    process.env.KCLUB_SKIP_DB_PRERENDER === "1" &&
    name === "public_catalogue"
  ) {
    return true;
  }

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
  if (!auth?.member) {
    throw new Error("Unauthorized");
  }
  const actor = buildActor(auth.member);
  if (!can(actor, "manage_flags", "feature_flag")) {
    throw new Error("Unauthorized");
  }

  const flagName = assertFlagName(name);
  await upsertFlag(db, flagName, enabled);

  revalidatePath("/dashboard/admin/flags");
  revalidatePath("/directory");
}

export async function getFeatureFlagsAction() {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    throw new Error("Unauthorized");
  }
  const actor = buildActor(auth.member);
  if (!can(actor, "manage_flags", "feature_flag")) {
    throw new Error("Unauthorized");
  }

  return listFlagRows(db);
}
