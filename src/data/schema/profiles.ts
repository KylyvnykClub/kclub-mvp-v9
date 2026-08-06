import { pgTable, text, varchar, jsonb, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns";
import { members } from "./members";

export const profiles = pgTable("profiles", {
  ...baseColumns,
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" })
    .unique(),
  bio: text("bio"),
  industry: varchar("industry", { length: 255 }),
  location: varchar("location", { length: 255 }),
  avatarUrl: varchar("avatar_url", { length: 2048 }),
  socialLinks: jsonb("social_links").$type<{
    linkedin?: string;
    twitter?: string;
    instagram?: string;
    website?: string;
  }>(),
});
