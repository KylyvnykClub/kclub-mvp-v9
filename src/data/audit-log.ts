import { and, desc, gte, ilike, lte, or } from "drizzle-orm";
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

export interface AuditLogFilters {
  query?: string;
  actor?: string;
  target?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export async function searchAuditLogs(
  db: DbClient,
  filters: AuditLogFilters = {},
) {
  const conditions = [];

  if (filters.query) {
    const searchPattern = `%${filters.query}%`;
    conditions.push(
      or(
        ilike(auditLog.action, searchPattern),
        ilike(auditLog.actorType, searchPattern),
        ilike(auditLog.actorId, searchPattern),
        ilike(auditLog.subjectType, searchPattern),
        ilike(auditLog.subjectId, searchPattern),
      ),
    );
  }

  if (filters.actor) {
    const actorPattern = `%${filters.actor}%`;
    conditions.push(
      or(
        ilike(auditLog.actorType, actorPattern),
        ilike(auditLog.actorId, actorPattern),
      ),
    );
  }

  if (filters.target) {
    const targetPattern = `%${filters.target}%`;
    conditions.push(
      or(
        ilike(auditLog.subjectType, targetPattern),
        ilike(auditLog.subjectId, targetPattern),
      ),
    );
  }

  if (filters.dateFrom) {
    conditions.push(gte(auditLog.createdAt, filters.dateFrom));
  }

  if (filters.dateTo) {
    conditions.push(lte(auditLog.createdAt, filters.dateTo));
  }

  const baseQuery = db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.createdAt))
    .limit(100);

  if (conditions.length > 0) {
    return await baseQuery.where(and(...conditions));
  }

  return await baseQuery;
}
