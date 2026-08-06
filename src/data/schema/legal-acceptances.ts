import { pgTable, varchar, uuid, timestamp } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns";
import { members } from "./members";

export const legalAcceptances = pgTable("legal_acceptances", {
  ...baseColumns,

  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),

  // The identifier of the document (FR-093, FR-097): 'terms-of-use',
  // 'privacy-policy', 'arbitration' (Terms §29–30), 'age-verification'
  documentId: varchar("document_id", { length: 255 }).notNull(),

  // The specific version accepted (FR-093)
  version: varchar("version", { length: 50 }).notNull(),

  // The timestamp it was accepted (FR-097 requires this)
  acceptedAt: timestamp("accepted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
