"use server";

import { z } from "zod";
import { db } from "@/data/db";
import { upsertProfile, type SocialLinks } from "@/data/profiles";
import { getCurrentMember } from "@/actions/session";
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
