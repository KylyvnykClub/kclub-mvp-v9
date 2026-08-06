"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "./session";
import { db } from "@/data/db";
import { setCategoryStatus } from "@/data/companies";

export async function toggleCategoryStatusAction(
  categoryId: number,
  currentStatus: string,
) {
  const result = await getCurrentMember();
  if (!result || !result.member || result.member.role !== "admin") {
    throw new Error("Unauthorized");
  }

  const newStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";

  await setCategoryStatus(db, categoryId, newStatus);

  revalidatePath("/dashboard/admin/categories");
}
