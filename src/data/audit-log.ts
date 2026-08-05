import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { auditLog } from "./schema/audit-log";

export interface AuditEntry {
  actorType: string;
  actorId?: string | null;
  action: string;
  subjectType: string;
  subjectId: string;
  meta?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
}

export async function appendAuditEntry(
  db: PgDatabase<PgQueryResultHKT>,
  entry: AuditEntry,
) {
  const [row] = await db
    .insert(auditLog)
    .values({
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      action: entry.action,
      subjectType: entry.subjectType,
      subjectId: entry.subjectId,
      meta: entry.meta ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      correlationId: entry.correlationId ?? null,
    })
    .returning({ id: auditLog.id, createdAt: auditLog.createdAt });

  return row!;
}
