import { and, desc, eq } from "drizzle-orm";
import type { Db, DbClient } from "./db";
import { planPrices } from "./schema";
import type { CheckoutPlan } from "@/modules/billing/checkout";

export async function findActivePlanPrice(
  db: DbClient,
  plan: CheckoutPlan,
): Promise<string | null> {
  const row = await db.query.planPrices.findFirst({
    where: and(eq(planPrices.plan, plan), eq(planPrices.active, true)),
    orderBy: [desc(planPrices.effectiveFrom)],
  });

  return row?.stripePriceId ?? null;
}

/**
 * Which plan a Stripe price belongs to, including prices no longer active.
 *
 * A repriced plan keeps its old subscriptions on the old price (FR-059), so a
 * lookup that only saw active rows would fail to recognise exactly the
 * subscriptions that have been running longest.
 */
export async function findPlanByStripePriceId(
  db: DbClient,
  stripePriceId: string,
): Promise<CheckoutPlan | null> {
  const row = await db.query.planPrices.findFirst({
    where: eq(planPrices.stripePriceId, stripePriceId),
    orderBy: [desc(planPrices.effectiveFrom)],
  });

  return (row?.plan as CheckoutPlan | undefined) ?? null;
}

export async function setActivePlanPrice(
  db: Db,
  plan: CheckoutPlan,
  stripePriceId: string,
  createdBy: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(planPrices)
      .set({ active: false })
      .where(and(eq(planPrices.plan, plan), eq(planPrices.active, true)));

    await tx.insert(planPrices).values({
      plan,
      stripePriceId,
      createdBy,
    });
  });
}

export async function listPlanPrices(db: DbClient, plan?: CheckoutPlan) {
  return db.query.planPrices.findMany({
    where: plan ? eq(planPrices.plan, plan) : undefined,
    orderBy: [desc(planPrices.effectiveFrom)],
  });
}

/**
 * Which plan a projected subscription is for (ADR 0033).
 *
 * A company attached settles it: only a listing has one. For a member-scoped
 * subscription the price decides, read first from `plan_prices` - which holds
 * every price the club has ever sold, including the superseded ones a
 * long-running subscription is still on (FR-059) - and then from the
 * environment.
 *
 * The fallback is `vip`, because that is what every member-scoped subscription
 * was before dues existed: a database that predates this column and a Stripe
 * price nobody recorded resolve to the answer that was true then.
 *
 * It reads `process.env` rather than the validated `@/env`, and lives here
 * rather than beside the checkout prices, for one reason: the entitlement
 * projection imports it, and a projection that imports the environment module
 * makes every unit test touching it need a configured environment. The value
 * itself is still validated where the application boots - the schema requires
 * it in production.
 */
export async function planForSubscription(
  db: DbClient,
  input: { priceId: string; companyId: string | null },
): Promise<"membership" | "vip" | "listing"> {
  if (input.companyId) return "listing";

  const recorded = await findPlanByStripePriceId(db, input.priceId);
  if (recorded === "membership" || recorded === "vip") return recorded;

  const membershipPriceId = process.env["STRIPE_MEMBER_PRICE_ID"];
  if (
    input.priceId &&
    membershipPriceId &&
    input.priceId === membershipPriceId
  ) {
    return "membership";
  }

  return "vip";
}
