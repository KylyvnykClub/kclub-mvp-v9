import { pgTable, varchar, primaryKey, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns";
import { profiles } from "./profiles";

export const tags = pgTable("tags", {
  ...baseColumns,
  name: varchar("name", { length: 100 }).notNull().unique(),
  category: varchar("category", { length: 100 }),
});

export const profileTags = pgTable(
  "profile_tags",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.tagId] })],
);
