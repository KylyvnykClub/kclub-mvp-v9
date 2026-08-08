import { desc, ilike, or } from "drizzle-orm";
import type { DbClient, InsertClient } from "./db";
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
  db: InsertClient,
  entry: AuditEntry,
): Promise<{ id: string; createdAt: Date }> {
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

export async function searchAuditLogs(db: DbClient, query?: string) {
  const baseQuery = db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.createdAt))
    .limit(100);

  if (query) {
    const searchPattern = `%${query}%`;
    return await baseQuery.where(
      or(
        ilike(auditLog.action, searchPattern),
        ilike(auditLog.actorId, searchPattern),
        ilike(auditLog.subjectId, searchPattern),
      ),
    );
  }

  return await baseQuery;
}
