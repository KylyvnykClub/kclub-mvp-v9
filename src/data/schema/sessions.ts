import { pgTable, text, uuid, timestamp, varchar } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns";
import { members } from "./members";

export const sessions = pgTable("sessions", {
  ...baseColumns,
  
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
    
  // The token issued to the client
  token: text("token").notNull().unique(),
  
  // Auditing / Session management (FR-007)
  userAgent: text("user_agent").notNull(),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),
  
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
