"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/data/db";
import {
  requestAccountDeletionTx,
  type DeletionSubscriptionChoice,
} from "@/data/account-deletion";
import { listActiveSubscriptionsForDeletion } from "@/data/billing";
import { upsertProfile, type SocialLinks } from "@/data/profiles";
import { getCurrentMember } from "@/actions/session";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import { revalidatePath } from "next/cache";

const updateProfileSchema = z.object({
  bio: z.string().max(1000).optional(),
  industry: z.string().max(255).optional(),
  location: z.string().max(255).optional(),
  avatarUrl: z.string().url().max(2048).optional().or(z.literal("")),
  linkedin: z.string().url().max(255).optional().or(z.literal("")),
  twitter: z.string().url().max(255).optional().or(z.literal("")),
});

export type ProfileFormState = { success: boolean; error?: string };

export async function updateProfileAction(
  _prevState: ProfileFormState | null,
  formData: FormData,
): Promise<ProfileFormState> {
  try {
    const auth = await getCurrentMember();
    if (!auth || !auth.member) {
      return { success: false, error: "Unauthorized" };
    }

    const data = updateProfileSchema.parse({
      bio: formData.get("bio") || undefined,
      industry: formData.get("industry") || undefined,
      location: formData.get("location") || undefined,
      avatarUrl: formData.get("avatarUrl") || undefined,
      linkedin: formData.get("linkedin") || undefined,
      twitter: formData.get("twitter") || undefined,
    });

    const socialLinks: SocialLinks = {
      ...(data.linkedin ? { linkedin: data.linkedin } : {}),
      ...(data.twitter ? { twitter: data.twitter } : {}),
    };

    await upsertProfile(db, auth.member.id, {
      bio: data.bio,
      industry: data.industry,
      location: data.location,
      avatarUrl: data.avatarUrl || null,
      socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : null,
    });

    revalidatePath("/dashboard/profile");
    return { success: true };
  } catch (err) {
    if (err instanceof z.ZodError)
      return { success: false, error: err.issues[0]?.message };
    return { success: false, error: "Failed to update profile" };
  }
}

export async function requestAccountDeletionAction(formData: FormData) {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    throw new Error("Unauthorized");
  }

  const actor = buildActor(auth.member);
  if (!can(actor, "delete", "own_profile")) {
    throw new Error("Unauthorized");
  }

  if (formData.get("confirmDeletion") !== "on") {
    throw new Error("Please confirm the deletion request");
  }

  const activeSubscriptions = await listActiveSubscriptionsForDeletion(
    db,
    auth.member.id,
  );
  const choices: DeletionSubscriptionChoice[] = activeSubscriptions.map(
    (subscription) => {
      const value = formData.get(`subscription:${subscription.id}`);
      if (value !== "cancel" && value !== "keep") {
        throw new Error("Every active subscription requires a decision");
      }

      return {
        subscriptionId: subscription.id,
        decision: value,
      };
    },
  );

  await requestAccountDeletionTx(db, auth.member.id, choices);

  const cookieStore = await cookies();
  cookieStore.delete("session");

  redirect(`/${auth.member.language || "en"}/login`);
}
