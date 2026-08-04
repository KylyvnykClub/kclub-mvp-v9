import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const featureFlag = pgTable("feature_flag", {
  name: text("name").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
