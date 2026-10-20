import {
  index,
  pgEnum,
  pgTable,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { members } from "./members";

export const reviewStatusEnum = pgEnum("review_status", [
  "pending",
  "approved",
  "rejected",
]);

/**
 * A member's review of a partner (ADR 0047). The member id is here so staff
 * can moderate and a member can edit their own; it is never read by anything a
 * member or a guest sees (ADR 0005).
 */
export const companyReviews = pgTable(
  "company_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    rating: smallint("rating").notNull(),
    body: varchar("body", { length: 1000 }).notNull(),
    locale: varchar("locale", { length: 2 }).notNull(),
    status: reviewStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    moderatedBy: uuid("moderated_by").references(() => members.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("company_reviews_company_member_idx").on(
      table.companyId,
      table.memberId,
    ),
    index("company_reviews_company_status_idx").on(
      table.companyId,
      table.status,
      table.createdAt,
    ),
  ],
);

export type ReviewStatus = (typeof reviewStatusEnum.enumValues)[number];
