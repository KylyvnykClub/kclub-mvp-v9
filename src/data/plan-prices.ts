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
