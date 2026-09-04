import { sql } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { baseColumns } from "./columns";
import { members } from "./members";

export const passwordResetRequestStatusEnum = pgEnum(
  "password_reset_request_status",
  ["open", "handled", "dismissed"],
);

/**
 * A member asking staff to reset their password (FR-006, ADR 0031).
 *
 * Recovery is performed by a staff owner and always has been
 * ([ADR 0018](../../../docs/decisions/0018-staff-assisted-password-reset.md));
 * what was missing was the member's half — a way to ask that does not depend
 * on knowing where to write. This table is that queue.
 *
 * It holds no secret and grants nothing. A row is a request for attention;
 * the reset itself stays an owner-only action with its own audit entry, and a
 * request neither performs nor authorises it.
 *
 * The phone number is stored as submitted rather than read from the member at
 * display time, because the console needs to show what the caller typed — a
 * member who has since changed their number is exactly the case support has
 * to reason about.
 */
export const passwordResetRequests = pgTable(
  "password_reset_requests",
  {
    ...baseColumns,

    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),

    phone: varchar("phone", { length: 20 }).notNull(),

    status: passwordResetRequestStatusEnum("status").notNull().default("open"),

    handledAt: timestamp("handled_at", { withTimezone: true }),

    /** The staff member who dealt with it. Never the member themselves. */
    handledBy: uuid("handled_by").references(() => members.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    // The console reads the queue, newest first.
    index("password_reset_requests_status_idx").on(
      table.status,
      table.createdAt.desc(),
    ),

    // One open request per member. Asking twice is not two problems, and
    // without this the form is a way to fill a staff screen with noise.
    uniqueIndex("password_reset_requests_one_open_idx")
      .on(table.memberId)
      .where(sql`${table.status} = 'open'`),
  ],
);

export type PasswordResetRequestStatus =
  (typeof passwordResetRequestStatusEnum.enumValues)[number];
