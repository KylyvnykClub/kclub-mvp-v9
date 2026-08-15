import { integer, jsonb, pgTable, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns";
import { members } from "./members";

/**
 * An in-progress company application (FR-040).
 *
 * Kept out of `companies` deliberately. A company row requires a name, a slug
 * and a category; a draft by definition may have none of them yet, and the only
 * way to store one in `companies` would be to drop those NOT NULL constraints
 * for every published partner as well. A transient state does not get to weaken
 * the invariants of the live data — see
 * [ADR 0011](../../../docs/decisions/0011-company-drafts-in-their-own-table.md).
 *
 * One draft per member: the flow in ux.md §3.3 submits one company at a time,
 * and a single row makes "resume where you left off" a lookup rather than a
 * choice the applicant has to make.
 *
 * Retention: 90 days from the last edit (data-storage.md §4). Deleted on
 * submission, swept when abandoned, and cascaded on member deletion.
 */
export const companyDrafts = pgTable("company_drafts", {
  ...baseColumns,

  ownerId: uuid("owner_id")
    .notNull()
    .unique()
    .references(() => members.id, { onDelete: "cascade" }),

  /** The furthest step the applicant has completed, 1..4. */
  step: integer("step").notNull().default(1),

  /** Partial form values. Validated per step, never trusted on read. */
  data: jsonb("data").notNull(),
});
