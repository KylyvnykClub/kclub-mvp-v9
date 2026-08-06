import { pgTable, varchar, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns";
import { members } from "./members";

export const stripeCustomers = pgTable("stripe_customers", {
  ...baseColumns,
  memberId: uuid("member_id")
    .notNull()
    .unique()
    .references(() => members.id, { onDelete: "cascade" }),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 })
    .notNull()
    .unique(),
});
