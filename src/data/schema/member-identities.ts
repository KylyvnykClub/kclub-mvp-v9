import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { baseColumns } from "./columns";
import { members } from "./members";

export const identityProviderEnum = pgEnum("identity_provider", ["google"]);

/**
 * An external account a member may sign in through (ADR 0029).
 *
 * A table rather than a column on `members`, because the provider's own
 * account id is what a sign-in is matched on and a member may one day link a
 * second provider. Nothing about the provider's user is copied here beyond
 * that id: the address they gave us is stored once, on `members`, and read
 * from there.
 *
 * Two unique indexes, and both matter. One provider account belongs to one
 * member, or a single Google account could sign in as two people; and one
 * member holds at most one account per provider, or "sign in with Google"
 * would have to ask which.
 */
export const memberIdentities = pgTable(
  "member_identities",
  {
    ...baseColumns,

    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),

    provider: identityProviderEnum("provider").notNull(),

    /** The provider's stable subject id (`sub`), never the email address. */
    providerAccountId: text("provider_account_id").notNull(),

    linkedAt: timestamp("linked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("member_identities_provider_account_idx").on(
      table.provider,
      table.providerAccountId,
    ),
    uniqueIndex("member_identities_member_provider_idx").on(
      table.memberId,
      table.provider,
    ),
  ],
);

export type IdentityProvider = (typeof identityProviderEnum.enumValues)[number];
