import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
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
 * `join_links_one_active_per_kind` (a partial unique index on `kind` where
 * `active`) keeps exactly one live door of each kind: rotation is
 * revoke-then-insert, and a second active row is refused by the database
 * rather than by whoever remembers.
 *
 * ADR 0040 adds the second kind. A `member` link makes a sponsored member; a
 * `partner` link lets a business file its application with the listing
 * waived. Neither records who shared it.
 */
export const joinLinkKindEnum = pgEnum("join_link_kind", ["member", "partner"]);

export type JoinLinkKind = (typeof joinLinkKindEnum.enumValues)[number];

export const joinLinks = pgTable("join_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: joinLinkKindEnum("kind").notNull().default("member"),
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
