import { pgTable, text, varchar, pgEnum } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns";

export const memberStatusEnum = pgEnum("member_status", [
  "active",
  "blocked",
  "pending_deletion",
]);

export const members = pgTable("members", {
  ...baseColumns,
  // FR-001: E.164 phone number, uniquely identifies the member
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  
  // Password hash using Argon2id (FR-001, FR-005)
  passwordHash: text("password_hash").notNull(),
  
  // FR-008: display name, language, country
  displayName: varchar("display_name", { length: 255 }).notNull(),
  country: varchar("country", { length: 2 }).notNull(), // ISO 3166-1 alpha-2
  language: varchar("language", { length: 2 }).notNull(), // ISO 639-1
  
  // Status tracking (FR-009, FR-010)
  status: memberStatusEnum("status").notNull().default("active"),
});
