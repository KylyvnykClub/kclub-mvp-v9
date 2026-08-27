"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/data/db";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/data/notifications";
import { buildActor } from "@/domain/actor";
import { assertCan } from "@/domain/authorization";
import { getCurrentMember } from "./session";

/**
 * The member's inbox (FR-099).
 *
 * Both actions are scoped by the session's own member id, which is also part of
 * the WHERE clause in the data layer - a notification id belonging to someone
 * else matches nothing rather than confirming that it exists. There is
 * deliberately no action that reads or writes another member's notifications,
 * for any role (ADR 0005).
 */

export type NotificationActionState = { success: boolean; error?: string };

export async function markNotificationReadAction(
  notificationId: string,
): Promise<NotificationActionState> {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    return { success: false, error: "Unauthorized" };
  }

  const actor = buildActor(auth.member);
  assertCan(actor, "update", "own_notification");

  await markNotificationRead(db, auth.member.id, notificationId, new Date());

  revalidatePath("/dashboard/profile");
  return { success: true };
}

export async function markAllNotificationsReadAction(): Promise<NotificationActionState> {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    return { success: false, error: "Unauthorized" };
  }

  const actor = buildActor(auth.member);
  assertCan(actor, "update", "own_notification");

  await markAllNotificationsRead(db, auth.member.id, new Date());

  revalidatePath("/dashboard/profile");
  return { success: true };
}
