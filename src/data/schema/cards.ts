import {
  pgTable,
  text,
  varchar,
  uuid,
  pgEnum,
  pgSequence,
  timestamp,
} from "drizzle-orm/pg-core";
import { baseColumns } from "./columns";
import { members } from "./members";

export const cardTierEnum = pgEnum("card_tier", ["free", "vip"]);
export const cardStatusEnum = pgEnum("card_status", ["valid", "revoked"]);

/**
 * FR-020: the number half of the card serial (`UA-10001`), one sequence for
 * the whole club. Read through `nextCardSerial`, never with `max(serial) + 1`.
 */
export const cardSerialSeq = pgSequence("card_serial_seq", {
  startWith: 10001,
  minValue: 10001,
});

export const cards = pgTable("cards", {
  ...baseColumns,

  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),

  // FR-020: Human-readable serial, `UA-10001` - see src/lib/card-serial.ts
  serial: varchar("serial", { length: 50 }).notNull().unique(),

  // FR-022: Opaque, unguessable token for QR URL
  token: text("token").notNull().unique(),

  // Hash used for card verification lookup.
  tokenHash: text("token_hash").unique(),

  // FR-023: Tier
  tier: cardTierEnum("tier").notNull().default("free"),

  // FR-023: Status (valid / revoked)
  status: cardStatusEnum("status").notNull().default("valid"),

  issuedAt: timestamp("issued_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
