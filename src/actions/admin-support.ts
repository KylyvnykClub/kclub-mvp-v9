"use server";

import { db } from "@/data/db";
import { getCurrentMember } from "@/actions/session";
import { can } from "@/domain/authorization";
import { buildActor } from "@/domain/actor";
import { getAdminSupportMetrics } from "@/data/admin";

export async function getSupportMetricsAction() {
  const session = await getCurrentMember();
  if (!session?.member) throw new Error("Unauthorized");

  const actor = buildActor(session.member);
  // Reusing "read company" permission as a proxy for support dashboard access
  if (!can(actor, "read", "company")) {
    throw new Error("Unauthorized");
  }

  return await getAdminSupportMetrics(db);
}
