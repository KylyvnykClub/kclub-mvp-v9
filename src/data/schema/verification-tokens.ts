import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { baseColumns } from "./columns";
import { members } from "./members";

export const verificationPurposeEnum = pgEnum("verification_purpose", [
  "email_verify",
  "password_reset",
]);

/**
 * Single-use links sent to a member's email address (ADR 0028): proving an
 * address belongs to them, and — once FR-006's self-service reset lands —
 * proving it again before a password changes.
 *
 * The token itself is never stored. What the member receives is 32 random
 * bytes; what this table holds is their SHA-256, the same shape
 * `sessions.token_hash` already uses, so a stolen database dump yields no
 * usable link. Lookup is by hash, which is why the hash is the unique column.
 *
 * `email` is on the row rather than read from the member at redemption time,
 * because the two can disagree: a member who claims one address, changes their
 * mind and claims another must not have the first link verify the second.
 */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    ...baseColumns,

    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),

    purpose: verificationPurposeEnum("purpose").notNull(),

    // The address this token was issued for, lowercased by `emailSchema`.
    email: varchar("email", { length: 255 }).notNull(),

    tokenHash: text("token_hash").notNull().unique(),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    /**
     * Stamped by the redemption itself, in the same statement that reads the
     * row, so two clicks on the same link cannot both succeed.
     */
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (table) => [
    // Read by the resend throttle and by the delete-then-insert that reissues
    // a link, both of which ask for one member's tokens of one purpose.
    index("verification_tokens_member_purpose_idx").on(
      table.memberId,
      table.purpose,
    ),
  ],
);

export type VerificationPurpose =
  (typeof verificationPurposeEnum.enumValues)[number];
