import {
  boolean,
  index,
  inet,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { baseColumns } from "./columns";
import { companies } from "./companies";
import { inviteLinks } from "./invite-links";
import { members } from "./members";

/** Mirrors `ApplicationRoute` (ADR 0044). */
export const applicationRouteEnum = pgEnum("application_route", [
  "public",
  "invite",
]);

/** Mirrors `ConsentKind` (ADR 0044). */
export const consentKindEnum = pgEnum("consent_kind", [
  "terms",
  "payment_authority",
  "publication",
  "marketing",
  "eu_early_start",
  "eu_withdrawal",
]);

/**
 * One row per box a business ticked, with the words it saw (ADR 0044 §2).
 *
 * The full text is stored, not a key: a translation changes, and the record
 * must still say what this person agreed to. `wording` names which of the
 * payment-authority texts it was, because a consent to a free month is not a
 * consent to a reservation. An EU withdrawal is recorded here too, as the
 * evidence that the contract ended.
 *
 * Kept six years from `accepted_at` (data-storage.md), past the end of the
 * account: it is evidence of a contract, held under the legal-obligation and
 * legal-claims bases, so the member link is cleared rather than the row
 * deleted when an account is erased.
 */
export const consentRecords = pgTable(
  "consent_records",
  {
    ...baseColumns,
    memberId: uuid("member_id").references(() => members.id, {
      onDelete: "set null",
    }),
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    kind: consentKindEnum("kind").notNull(),
    route: applicationRouteEnum("route").notNull(),
    /** `invite` | `public_hold` | `public_setup` for payment authority. */
    wording: varchar("wording", { length: 32 }),
    textVersion: varchar("text_version", { length: 32 }).notNull(),
    /** sha256 of `text`, so two records of the same words compare cheaply. */
    textHash: varchar("text_hash", { length: 64 }).notNull(),
    text: text("text").notNull(),
    locale: varchar("locale", { length: 8 }).notNull(),
    /** ISO 3166-1 alpha-2, the member's country of residence then. */
    residenceCountry: varchar("residence_country", { length: 2 }),
    inviteLinkId: uuid("invite_link_id").references(() => inviteLinks.id, {
      onDelete: "set null",
    }),
    ipAddress: inet("ip_address"),
    userAgent: varchar("user_agent", { length: 512 }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("consent_records_company_kind_idx").on(table.companyId, table.kind),
  ],
);

/**
 * How a listing paid by a saved card starts (ADR 0044 §1, §5): the invite
 * route's free month, or an EU consumer's deferred start. One row per company,
 * which makes it the record of one logical operation across Stripe and our
 * database - card saved, published, subscription started - so a retry reads
 * where the last attempt stopped instead of starting a second subscription.
 *
 * The card columns are a projection of the setup Checkout session and its
 * SetupIntent, re-read from Stripe on `checkout.session.completed` /
 * `setup_intent.succeeded`; nothing is taken from the browser's return.
 */
export const listingActivations = pgTable("listing_activations", {
  ...baseColumns,
  companyId: uuid("company_id")
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: "cascade" }),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  route: applicationRouteEnum("route").notNull(),
  /** One free calendar month from publication (the invite route). */
  freeMonth: boolean("free_month").notNull(),
  /** EU deferral: nothing starts before this (ADR 0044 §5). */
  startNotBefore: timestamp("start_not_before", { withTimezone: true }),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  setupCheckoutSessionId: varchar("setup_checkout_session_id", {
    length: 255,
  }),
  setupIntentId: varchar("setup_intent_id", { length: 255 }),
  paymentMethodId: varchar("payment_method_id", { length: 255 }),
  cardSavedAt: timestamp("card_saved_at", { withTimezone: true }),
  /** The moment the listing went public and the free month began. */
  publishedAt: timestamp("published_at", { withTimezone: true }),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  /** The first invoice with money in it was paid (not a $0 trial invoice). */
  firstPaidAt: timestamp("first_paid_at", { withTimezone: true }),
  /** ADR 0004 watermark for the setup projection. */
  stripeUpdatedAt: timestamp("stripe_updated_at", { withTimezone: true }),
});
