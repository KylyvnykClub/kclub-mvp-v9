import {
  pgTable,
  text,
  varchar,
  pgEnum,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { baseColumns } from "./columns";

export const memberStatusEnum = pgEnum("member_status", [
  "active",
  "blocked",
  "pending_deletion",
]);

export const memberRoleEnum = pgEnum("member_role", [
  "user",
  "admin",
  "member",
  "member_vip",
  "partner_owner",
  "staff_support",
  "staff_moderator",
  "staff_admin",
  "staff_owner",
]);

export const members = pgTable("members", {
  ...baseColumns,
  // FR-001: E.164 phone number, uniquely identifies the member
  phone: varchar("phone", { length: 20 }).notNull().unique(),

  /**
   * FR-001: the member's second identifier, and the only channel that can
   * prove who they are when the phone number is gone (FR-006, ADR 0028).
   *
   * Nullable because the members who registered before this column existed
   * have none, and are asked rather than forced. Stored lowercased — the
   * address arrives through `emailSchema`, which is the only thing that writes
   * here, so a plain unique index is enough and no `citext` extension is
   * needed.
   */
  email: varchar("email", { length: 255 }).unique(),

  /**
   * Set when a link sent to that address was clicked. An unverified address
   * signs nobody in and resets no password: it is a claim, not a proof.
   */
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),

  // Password hash using Argon2id (FR-001, FR-005)
  passwordHash: text("password_hash").notNull(),

  // FR-008: display name, language, country
  displayName: varchar("display_name", { length: 255 }).notNull(),
  locale: varchar("locale", { length: 10 }).notNull().default("en"),
  canSendReferrals: boolean("can_send_referrals").notNull().default(true),
  country: varchar("country", { length: 2 }).notNull(), // ISO 3166-1 alpha-2
  language: varchar("language", { length: 2 }).notNull(), // ISO 639-1

  // Status tracking (FR-009, FR-010)
  status: memberStatusEnum("status").notNull().default("active"),

  // TOTP Tracking (FR-080)
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),

  // Role tracking
  role: memberRoleEnum("role").notNull().default("member"),

  /**
   * FR-009: set when the 30-day erasure has run. The row survives so payment
   * and audit records keep a valid foreign key (data-storage.md §4); what it
   * still holds - internal id, country, registration month - is enough for
   * revenue reporting and insufficient to identify a person.
   */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
