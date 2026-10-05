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
 * A member's personal invite links (ADR 0042).
 *
 * Unlike the club's join links (ADR 0033), these belong to a member, and a
 * newcomer who registers through one is recorded against them in
 * `invitations`. The code is random and says nothing about its owner.
 *
 * `invite_links_one_active_per_owner_kind` (a partial unique index on
 * `(owner_member_id, kind)` where `active`, in the migration) keeps one live
 * link of each kind per member: rotation is revoke-then-insert.
 */
export const inviteLinkKindEnum = pgEnum("invite_link_kind", [
  "member",
  "partner",
]);

export type InviteLinkKind = (typeof inviteLinkKindEnum.enumValues)[number];

export const inviteLinks = pgTable("invite_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerMemberId: uuid("owner_member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  kind: inviteLinkKindEnum("kind").notNull(),
  code: text("code").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

/** The inviter's standing when the newcomer registered, frozen there. */
export const inviterStandingEnum = pgEnum("inviter_standing", [
  "partner",
  "vip",
  "member",
]);

/**
 * Who brought whom (ADR 0042). One row per invitee - the primary key - written
 * once in the registration transaction and never rewritten. One level only:
 * nothing reads an invitee as an inviter to go further down, and there is no
 * column that could carry a reward to the inviter.
 *
 * `waived` is what the invite matrix granted at that moment; it does not move
 * if the inviter's standing or the matrix later changes.
 */
export const invitations = pgTable("invitations", {
  inviteeMemberId: uuid("invitee_member_id")
    .primaryKey()
    .references(() => members.id, { onDelete: "cascade" }),
  inviterMemberId: uuid("inviter_member_id").references(() => members.id, {
    onDelete: "set null",
  }),
  inviteLinkId: uuid("invite_link_id").references(() => inviteLinks.id, {
    onDelete: "set null",
  }),
  kind: inviteLinkKindEnum("kind").notNull(),
  inviterStanding: inviterStandingEnum("inviter_standing").notNull(),
  waived: boolean("waived").notNull(),
  /**
   * When a partner link's waiver was spent on a company. One listing per
   * invitation, held here rather than on the company so that it survives the
   * link being deleted.
   */
  waiverUsedAt: timestamp("waiver_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
