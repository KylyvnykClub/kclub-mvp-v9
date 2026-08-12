"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "./session";
import { db } from "@/data/db";
import { setCategoryStatus } from "@/data/companies";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";

export async function toggleCategoryStatusAction(
  categoryId: number,
  currentStatus: string,
) {
  const result = await getCurrentMember();
  if (!result?.member) {
    throw new Error("Unauthorized");
  }

  const actor = buildActor(result.member);
  if (!can(actor, "publish", "company")) {
    throw new Error("Unauthorized");
  }

  const newStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";

  await setCategoryStatus(db, categoryId, newStatus);

  revalidatePath("/dashboard/admin/categories");
}
