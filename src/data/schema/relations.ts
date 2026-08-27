import { relations } from "drizzle-orm";
import { members } from "./members";
import { sessions } from "./sessions";
import { cards } from "./cards";
import { legalAcceptances } from "./legal-acceptances";
import { profiles } from "./profiles";
import { tags, profileTags } from "./tags";
import { companies } from "./companies";
import { businessCategories } from "./business-categories";
import { businessCategoryTranslations } from "./business-category-translations";
import { companyCategories } from "./company-categories";
import { companyServiceCountries } from "./company-service-countries";
import { cities } from "./cities";
import { subscriptions } from "./subscriptions";
import { stripeCustomers } from "./stripe-customers";
import { referrals } from "./referrals";
import { accountDeletionRequests } from "./account-deletion-requests";
import { notifications } from "./notifications";
import { countries } from "./countries";

export const membersRelations = relations(members, ({ one, many }) => ({
  sessions: many(sessions),
  cards: many(cards),
  legalAcceptances: many(legalAcceptances),
  profile: one(profiles, {
    fields: [members.id],
    references: [profiles.memberId],
  }),
  companies: many(companies),
  stripeCustomer: one(stripeCustomers, {
    fields: [members.id],
    references: [stripeCustomers.memberId],
  }),
  subscriptions: many(subscriptions),
  sentReferrals: many(referrals),
  accountDeletionRequests: many(accountDeletionRequests),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  member: one(members, {
    fields: [sessions.memberId],
    references: [members.id],
  }),
}));

export const cardsRelations = relations(cards, ({ one }) => ({
  member: one(members, {
    fields: [cards.memberId],
    references: [members.id],
  }),
}));

export const legalAcceptancesRelations = relations(
  legalAcceptances,
  ({ one }) => ({
    member: one(members, {
      fields: [legalAcceptances.memberId],
      references: [members.id],
    }),
  }),
);

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  member: one(members, {
    fields: [profiles.memberId],
    references: [members.id],
  }),
  profileTags: many(profileTags),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  profileTags: many(profileTags),
}));

export const profileTagsRelations = relations(profileTags, ({ one }) => ({
  profile: one(profiles, {
    fields: [profileTags.profileId],
    references: [profiles.id],
  }),
  tag: one(tags, {
    fields: [profileTags.tagId],
    references: [tags.id],
  }),
}));

export const companiesRelations = relations(companies, ({ one, many }) => ({
  owner: one(members, {
    fields: [companies.ownerId],
    references: [members.id],
  }),
  businessCategory: one(businessCategories, {
    fields: [companies.businessCategoryId],
    references: [businessCategories.id],
  }),
  subscriptions: many(subscriptions),
  receivedReferrals: many(referrals),
  categories: many(companyCategories),
  serviceCountries: many(companyServiceCountries),
}));

export const stripeCustomersRelations = relations(
  stripeCustomers,
  ({ one }) => ({
    member: one(members, {
      fields: [stripeCustomers.memberId],
      references: [members.id],
    }),
  }),
);

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  member: one(members, {
    fields: [subscriptions.memberId],
    references: [members.id],
  }),
  company: one(companies, {
    fields: [subscriptions.companyId],
    references: [companies.id],
  }),
}));

export const businessCategoriesRelations = relations(
  businessCategories,
  ({ many }) => ({
    companies: many(companies),
    translations: many(businessCategoryTranslations),
  }),
);

export const businessCategoryTranslationsRelations = relations(
  businessCategoryTranslations,
  ({ one }) => ({
    businessCategory: one(businessCategories, {
      fields: [businessCategoryTranslations.businessCategoryId],
      references: [businessCategories.id],
    }),
  }),
);

export const companyCategoriesRelations = relations(
  companyCategories,
  ({ one }) => ({
    company: one(companies, {
      fields: [companyCategories.companyId],
      references: [companies.id],
    }),
    businessCategory: one(businessCategories, {
      fields: [companyCategories.businessCategoryId],
      references: [businessCategories.id],
    }),
  }),
);

export const companyServiceCountriesRelations = relations(
  companyServiceCountries,
  ({ one }) => ({
    company: one(companies, {
      fields: [companyServiceCountries.companyId],
      references: [companies.id],
    }),
  }),
);

export const countriesRelations = relations(countries, ({ many }) => ({
  cities: many(cities),
}));

export const citiesRelations = relations(cities, ({ one }) => ({
  country: one(countries, {
    fields: [cities.countryCode],
    references: [countries.code],
  }),
}));

export const referralsRelations = relations(referrals, ({ one }) => ({
  sender: one(members, {
    fields: [referrals.senderId],
    references: [members.id],
  }),
  recipientCompany: one(companies, {
    fields: [referrals.recipientCompanyId],
    references: [companies.id],
  }),
  moderator: one(members, {
    fields: [referrals.moderatorId],
    references: [members.id],
  }),
}));

export const accountDeletionRequestsRelations = relations(
  accountDeletionRequests,
  ({ one }) => ({
    member: one(members, {
      fields: [accountDeletionRequests.memberId],
      references: [members.id],
    }),
  }),
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  member: one(members, {
    fields: [notifications.memberId],
    references: [members.id],
  }),
}));
