"use server";

import { db } from "@/data/db";
import { getCurrentMember } from "@/actions/session";
import { can } from "@/domain/authorization";
import { buildActor } from "@/domain/actor";
import { searchAuditLogs } from "@/data/audit-log";

function parseDateBoundary(value: string | undefined, endOfDay = false) {
  if (!value) return undefined;

  const date = new Date(
    `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`,
  );
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

export async function getAuditLogsAction(filters?: {
  q?: string;
  actor?: string;
  target?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const session = await getCurrentMember();
  if (!session?.member) throw new Error("Unauthorized");

  const actor = buildActor(session.member);
  if (!can(actor, "read", "audit_log")) {
    throw new Error("Unauthorized");
  }

  return await searchAuditLogs(db, {
    query: filters?.q,
    actor: filters?.actor,
    target: filters?.target,
    dateFrom: parseDateBoundary(filters?.dateFrom),
    dateTo: parseDateBoundary(filters?.dateTo, true),
  });
}
