import { pgTable, varchar, integer, timestamp } from "drizzle-orm/pg-core";

export const businessCategories = pgTable("business_categories", {
  id: integer("id").primaryKey(), // using integers from CSV
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  block: varchar("block", { length: 255 }).notNull(),
  category: varchar("category", { length: 255 }).notNull(),
  subcategory: varchar("subcategory", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("ACTIVE"),
});
