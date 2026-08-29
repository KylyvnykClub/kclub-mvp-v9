import { index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies";

/**
 * A company's photo gallery (ADR 0022). Each row is one KCLUB-hosted image
 * whose bytes live in R2 under `media/companies/{companyId}/{id}.webp` — the
 * row id is the object key, so deleting a row and deleting its object are
 * the same identifier. Display order is upload order; there is no manual
 * reordering and no caption, deliberately.
 */
export const companyImages = pgTable(
  "company_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("company_images_company_idx").on(table.companyId)],
);
