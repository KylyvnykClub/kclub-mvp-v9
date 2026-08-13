import {
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { countries } from "./countries";

export const cities = pgTable(
  "cities",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    countryCode: varchar("country_code", { length: 2 })
      .notNull()
      .references(() => countries.code, { onDelete: "restrict" }),
    name: varchar("name", { length: 255 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("ACTIVE"),
  },
  (table) => [
    uniqueIndex("cities_country_code_name_unique").on(
      table.countryCode,
      table.name,
    ),
  ],
);
