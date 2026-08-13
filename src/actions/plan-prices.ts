"use server";

import { revalidatePath } from "next/cache";
import { appendAuditEntry } from "@/data/audit-log";
import { db } from "@/data/db";
import { setActivePlanPrice } from "@/data/plan-prices";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import { getCurrentMember } from "./session";
import { z } from "zod";

const planPriceSchema = z.object({
  plan: z.enum(["vip", "listing"]),
  stripePriceId: z.string().startsWith("price_"),
});

export async function setPlanPriceAction(input: {
  plan: "vip" | "listing";
  stripePriceId: string;
}) {
  const current = await getCurrentMember();
  if (!current?.member) {
    throw new Error("Unauthorized");
  }

  const actor = buildActor(current.member);
  if (!can(actor, "manage_prices", "plan_price")) {
    throw new Error("Unauthorized");
  }

  const parsed = planPriceSchema.parse(input);

  await setActivePlanPrice(
    db,
    parsed.plan,
    parsed.stripePriceId,
    current.member.id,
  );

  await appendAuditEntry(db, {
    actorId: current.member.id,
    actorType: "member",
    action: "set_plan_price",
    subjectType: "plan_price",
    subjectId: parsed.plan,
    meta: { stripePriceId: parsed.stripePriceId },
    ip: "unknown",
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/profile");
}
