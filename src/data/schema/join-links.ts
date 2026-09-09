import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { members } from "./members";

/**
 * The club's private join link (ADR 0033).
 *
 * A door, not an invitation: the row records the secret, when it was made and
 * by whom, and nothing about who shared it or who came through it. There is no
 * quota, no expiry and no attribution, because attribution is the first step
 * towards the referral programme this product refuses to be (ADR 0009).
 *
 * The secret is stored in clear, deliberately. It is a shared password for a
 * door — printed in a newsletter, read out on a call — and the owner has to be
 * able to read the current one back in the console in order to hand it out. A
 * hash cannot be read back. Knowing the secret makes somebody a sponsored
 * member and nothing else; the answer to a leak is rotation.
 *
 * `join_links_one_active` (a partial unique index on `active`) keeps exactly
 * one live door: rotation is revoke-then-insert, and a second active row is
 * refused by the database rather than by whoever remembers.
 */
export const joinLinks = pgTable("join_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  secret: text("secret").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by").references(() => members.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
