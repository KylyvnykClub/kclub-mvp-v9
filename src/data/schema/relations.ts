import { relations } from "drizzle-orm";
import { members } from "./members";
import { sessions } from "./sessions";
import { cards } from "./cards";
import { legalAcceptances } from "./legal-acceptances";

export const membersRelations = relations(members, ({ many }) => ({
  sessions: many(sessions),
  cards: many(cards),
  legalAcceptances: many(legalAcceptances),
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

export const legalAcceptancesRelations = relations(legalAcceptances, ({ one }) => ({
  member: one(members, {
    fields: [legalAcceptances.memberId],
    references: [members.id],
  }),
}));
