import { and, desc, eq, sql } from "drizzle-orm";

import type { DbClient } from "./db";
import { members, passwordResetRequests } from "./schema";

/**
 * Record that a member has asked for a reset (FR-006, ADR 0031).
 *
 * Silently does nothing when the member already has an open request: asking
 * twice is not two problems, and the partial unique index is what enforces it
 * rather than a read-then-write that two clicks could both pass.
 */
export async function createPasswordResetRequest(
  db: DbClient,
  input: { memberId: string; phone: string },
): Promise<void> {
  await db
    .insert(passwordResetRequests)
    .values(input)
    // The index it conflicts with is partial, so the predicate has to be
    // repeated here: Postgres cannot infer a partial index from the column
    // alone (42P10).
    .onConflictDoNothing({
      target: passwordResetRequests.memberId,
      where: sql`${passwordResetRequests.status} = 'open'`,
    });
}

/**
 * The queue, newest first.
 *
 * Deliberately narrow: the display name and the number staff need to
 * recognise the caller, and nothing else about the member. A support screen
 * that grew into a member browser would be the directory this product does not
 * have (ADR 0005).
 */
export async function listOpenPasswordResetRequests(db: DbClient) {
  return db
    .select({
      id: passwordResetRequests.id,
      memberId: passwordResetRequests.memberId,
      phone: passwordResetRequests.phone,
      createdAt: passwordResetRequests.createdAt,
      displayName: members.displayName,
      memberStatus: members.status,
    })
    .from(passwordResetRequests)
    .innerJoin(members, eq(members.id, passwordResetRequests.memberId))
    .where(eq(passwordResetRequests.status, "open"))
    .orderBy(desc(passwordResetRequests.createdAt))
    .limit(100);
}

export type PasswordResetRequestView = Awaited<
  ReturnType<typeof listOpenPasswordResetRequests>
>[number];

export async function countOpenPasswordResetRequests(
  db: DbClient,
): Promise<number> {
  const rows = await listOpenPasswordResetRequests(db);
  return rows.length;
}

/**
 * Close a request.
 *
 * `handled` means staff acted on it, `dismissed` that they judged it not
 * genuine; both take it off the queue and neither changes a password. Guarded
 * on `open` so two staff members clicking at once do not both succeed, and the
 * caller can tell which of them did.
 */
export async function closePasswordResetRequest(
  db: DbClient,
  input: {
    requestId: string;
    staffId: string;
    outcome: "handled" | "dismissed";
    now: Date;
  },
): Promise<boolean> {
  const closed = await db
    .update(passwordResetRequests)
    .set({
      status: input.outcome,
      handledAt: input.now,
      handledBy: input.staffId,
    })
    .where(
      and(
        eq(passwordResetRequests.id, input.requestId),
        eq(passwordResetRequests.status, "open"),
      ),
    )
    .returning({ id: passwordResetRequests.id });

  return closed.length > 0;
}
