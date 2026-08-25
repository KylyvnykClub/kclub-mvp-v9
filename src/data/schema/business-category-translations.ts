import { integer, pgTable, primaryKey, varchar } from "drizzle-orm/pg-core";
import { businessCategories } from "./business-categories";

export const businessCategoryTranslations = pgTable(
  "business_category_translations",
  {
    businessCategoryId: integer("business_category_id")
      .notNull()
      .references(() => businessCategories.id, { onDelete: "cascade" }),
    locale: varchar("locale", { length: 2 }).notNull(),
    block: varchar("block", { length: 255 }).notNull(),
    category: varchar("category", { length: 255 }).notNull(),
    subcategory: varchar("subcategory", { length: 255 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.businessCategoryId, table.locale] }),
  ],
);
