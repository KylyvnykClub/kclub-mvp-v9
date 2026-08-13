import { jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { members } from "./members";

export const accountDeletionRequests = pgTable("account_deletion_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  requestedAt: timestamp("requested_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  subscriptionChoices: jsonb("subscription_choices").notNull(),
});
