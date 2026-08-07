import {
  pgTable,
  varchar,
  timestamp,
  text,
  boolean,
  pgEnum,
  uuid,
} from "drizzle-orm/pg-core";
import { baseColumns } from "./columns";
import { members } from "./members";
import { companies } from "./companies";

export const referralStatusEnum = pgEnum("referral_status", [
  "pending_review",
  "rejected",
  "delivered",
  "accepted",
  "declined",
  "expired",
]);

export const referrals = pgTable("referrals", {
  ...baseColumns,
  senderId: uuid("sender_id")
    .notNull()
    .references(() => members.id),
  recipientCompanyId: uuid("recipient_company_id")
    .notNull()
    .references(() => companies.id),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  contactChannel: text("contact_channel"),
  serviceNeeded: text("service_needed").notNull(),
  note: text("note"),
  status: referralStatusEnum("status").notNull().default("pending_review"),
  consentAttested: boolean("consent_attested").notNull().default(false),
  consentTimestamp: timestamp("consent_timestamp", { withTimezone: true }),
  moderatorId: uuid("moderator_id").references(() => members.id),
  moderationReason: text("moderation_reason"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
