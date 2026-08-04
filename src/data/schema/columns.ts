import { timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Standard columns applied to every table (data-storage.md §1):
 *   - id: UUIDv7 (time-ordered, b-tree inserts stay local, no sequence leak)
 *   - created_at / updated_at: timestamptz in UTC
 *
 * Usage:
 *   export const myTable = pgTable("my_table", {
 *     ...baseColumns,
 *     name: text("name").notNull(),
 *   });
 */
export const baseColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
