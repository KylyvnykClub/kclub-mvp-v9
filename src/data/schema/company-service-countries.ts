import { index, pgTable, primaryKey, uuid, varchar } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const companyServiceCountries = pgTable(
  "company_service_countries",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    countryCode: varchar("country_code", { length: 2 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.countryCode] }),
    index("company_service_countries_country_code_idx").on(table.countryCode),
  ],
);
