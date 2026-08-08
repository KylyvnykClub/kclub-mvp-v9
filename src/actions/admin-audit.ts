"use server";

import { db } from "@/data/db";
import { getCurrentMember } from "@/actions/session";
import { can } from "@/domain/authorization";
import { buildActor } from "@/domain/actor";
import { searchAuditLogs } from "@/data/audit-log";

export async function getAuditLogsAction(query?: string) {
  const session = await getCurrentMember();
  if (!session?.member) throw new Error("Unauthorized");

  const actor = buildActor(session.member);
  if (!can(actor, "read", "audit_log")) {
    throw new Error("Unauthorized");
  }

  return await searchAuditLogs(db, query);
}
