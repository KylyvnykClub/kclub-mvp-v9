import {
  pgTable,
  text,
  uuid,
  timestamp,
  varchar,
  boolean,
} from "drizzle-orm/pg-core";
import { baseColumns } from "./columns";
import { members } from "./members";

export const sessions = pgTable("sessions", {
  ...baseColumns,

  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),

  // Legacy lookup column retained during expand/migrate.
  token: text("token").notNull().unique(),

  // Hash used for new session lookup.
  tokenHash: text("token_hash").unique(),

  // Auditing / Session management (FR-007)
  userAgent: text("user_agent").notNull(),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),

  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  // For TOTP multi-step login
  isPartialSession: boolean("is_partial_session").notNull().default(false),
});
