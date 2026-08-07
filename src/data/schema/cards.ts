import {
  pgTable,
  text,
  varchar,
  uuid,
  pgEnum,
  timestamp,
} from "drizzle-orm/pg-core";
import { baseColumns } from "./columns";
import { members } from "./members";

export const cardTierEnum = pgEnum("card_tier", ["free", "vip"]);
export const cardStatusEnum = pgEnum("card_status", ["valid", "revoked"]);

export const cards = pgTable("cards", {
  ...baseColumns,

  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),

  // FR-020: Human-readable serial
  serial: varchar("serial", { length: 50 }).notNull().unique(),

  // FR-022: Opaque, unguessable token for QR URL
  token: text("token").notNull().unique(),

  // FR-023: Tier
  tier: cardTierEnum("tier").notNull().default("free"),

  // FR-023: Status (valid / revoked)
  status: cardStatusEnum("status").notNull().default("valid"),

  issuedAt: timestamp("issued_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
