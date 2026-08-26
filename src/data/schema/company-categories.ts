import { index, integer, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { businessCategories } from "./business-categories";

export const companyCategories = pgTable(
  "company_categories",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    businessCategoryId: integer("business_category_id")
      .notNull()
      .references(() => businessCategories.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.businessCategoryId] }),
    index("company_categories_category_idx").on(table.businessCategoryId),
  ],
);
