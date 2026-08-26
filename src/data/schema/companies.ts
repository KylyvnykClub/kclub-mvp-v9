import {
  jsonb,
  pgTable,
  varchar,
  text,
  integer,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";
import { baseColumns } from "./columns";
import { members } from "./members";
import { businessCategories } from "./business-categories";

export const moderationStatusEnum = pgEnum("moderation_status", [
  "pending",
  "approved",
  "rejected",
]);

export const showcaseTypeEnum = pgEnum("showcase_type", [
  "none",
  "top",
  "featured",
]);

export const businessFormatEnum = pgEnum("business_format", [
  "offline_only",
  "online_only",
  "online_offline",
  "on_site_service",
]);

export const companies = pgTable("companies", {
  ...baseColumns,
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),

  /** @deprecated Use company_categories join table instead. Nullable after migration 27. */
  businessCategoryId: integer("business_category_id").references(
    () => businessCategories.id,
    { onDelete: "restrict" },
  ),

  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(), // e.g. "acme-corp"
  legalName: varchar("legal_name", { length: 255 }),
  taxId: varchar("tax_id", { length: 50 }),
  description: text("description"),
  website: varchar("website", { length: 255 }),
  country: varchar("country", { length: 100 }),
  city: varchar("city", { length: 100 }),

  // Nullable during the staged migration so existing partners stay visible.
  registrationCountryCode: varchar("registration_country_code", {
    length: 2,
  }),
  businessFormat: businessFormatEnum("business_format"),
  administrativeLevel1: varchar("administrative_level_1", { length: 255 }),
  administrativeLevel2: varchar("administrative_level_2", { length: 255 }),
  specializationDescription: varchar("specialization_description", {
    length: 500,
  }),
  servesWorldwide: integer("serves_worldwide").notNull().default(0),

  // Partner / B2B specific fields
  discount: varchar("discount", { length: 255 }), // e.g. "15% off for members"
  logoUrl: varchar("logo_url", { length: 1000 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 50 }),

  // Moderation
  // FR-042: a submission must not be visible before approval. The default is
  // the safe end of the enum, so an insert path that forgets this column
  // queues the company for moderation rather than publishing it.
  moderationStatus: moderationStatusEnum("moderation_status")
    .default("pending")
    .notNull(),
  rejectionReason: text("rejection_reason"),

  // Showcase
  showcaseType: showcaseTypeEnum("showcase_type").default("none").notNull(),
  showcaseRank: integer("showcase_rank").default(0).notNull(),

  // Pending owner edits awaiting re-moderation (FR-045)
  pendingChanges: jsonb("pending_changes"),
});
