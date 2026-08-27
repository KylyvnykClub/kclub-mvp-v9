import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { baseColumns } from "./columns";
import { members } from "./members";

/**
 * The member's in-product inbox (FR-099, ADR 0020).
 *
 * Distinct from the notification *log* ADR 0014 rejected: that would have
 * recorded delivery attempts for our own debugging, a job Resend's dashboard
 * already does. This is product state the member reads, and the authoritative
 * record of what happened to them - email is the delivery channel, not the
 * source of truth (reliability.md, legal-alignment.md L-14).
 */
export const notificationKindEnum = pgEnum("notification_kind", [
  "welcome",
  "company_approved",
  "company_rejected",
  "referral_received",
  "payment_failed",
  "grace_expiry_warning",
]);

export const notifications = pgTable(
  "notifications",
  {
    ...baseColumns,

    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),

    kind: notificationKindEnum("kind").notNull(),

    /**
     * Ids, names and integer amounts only - never a rendered sentence.
     *
     * FR-090 requires every user-facing string in all three languages, and a
     * member can change `language` after a notification is written; stored prose
     * would freeze whichever language was current when it happened. The kind
     * selects an i18n message and these fill its placeholders at read time.
     *
     * The single exception is a rejection's moderator note, which is free text
     * a human wrote and no translation can reach. It is rendered as a quoted
     * note, visibly separate from the localised shell around it.
     */
    params: jsonb("params").notNull().default({}),

    readAt: timestamp("read_at", { withTimezone: true }),

    /**
     * Idempotency for anything written from outside a user's own request -
     * a redelivered Stripe webhook, a re-run sweep. Null for rows whose write
     * is already once-per-decision and needs no key.
     */
    dedupeKey: varchar("dedupe_key", { length: 255 }),
  },
  (table) => [
    // The inbox itself: one member's rows, newest first.
    index("notifications_member_created_idx").on(
      table.memberId,
      table.createdAt.desc(),
    ),

    // The unread badge runs on every dashboard render, so it gets a partial
    // index that stays small as read history accumulates behind it.
    index("notifications_member_unread_idx")
      .on(table.memberId)
      .where(sql`${table.readAt} is null`),

    // Partial, so the many rows that legitimately carry no key do not collide
    // with each other on a single null.
    uniqueIndex("notifications_dedupe_idx")
      .on(table.dedupeKey)
      .where(sql`${table.dedupeKey} is not null`),
  ],
);
