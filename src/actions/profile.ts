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
import {
  upsertProfile,
  type ProfileUpdate,
  type SocialLinks,
} from "@/data/profiles";
import { updateMemberPersonalInfo, updateMemberPhone } from "@/data/members";
import { findMemberByPhone } from "@/data/identity";
import { appendAuditEntry } from "@/data/audit-log";
import { localeCookieOptions } from "@/lib/locale-cookie";
import { getCurrentMember } from "@/actions/session";
import { buildActor } from "@/domain/actor";
import { assertCan } from "@/domain/authorization";
import { InvalidImageError, processAvatarImage } from "@/lib/image-processing";
import { AVATAR_SERVE_PATH } from "@/lib/avatar-path";
import { phoneSchema } from "@/lib/phone";
import { deleteAvatar, putAvatar } from "@/modules/platform/avatar-storage";
import {
  sendVerificationCode,
  checkVerificationCode,
} from "@/modules/identity/twilio";
import { revalidatePath } from "next/cache";

const updateProfileSchema = z.object({
  bio: z.string().max(1000).optional(),
  industry: z.string().max(255).optional(),
  location: z.string().max(255).optional(),
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

    const actor = buildActor(auth.member);
    assertCan(actor, "update", "own_profile");

    const data = updateProfileSchema.parse({
      bio: formData.get("bio") || undefined,
      industry: formData.get("industry") || undefined,
      location: formData.get("location") || undefined,
      linkedin: formData.get("linkedin") || undefined,
      twitter: formData.get("twitter") || undefined,
    });

    const socialLinks: SocialLinks = {
      ...(data.linkedin ? { linkedin: data.linkedin } : {}),
      ...(data.twitter ? { twitter: data.twitter } : {}),
    };

    const update: ProfileUpdate = {
      bio: data.bio,
      industry: data.industry,
      location: data.location,
      socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : null,
    };

    // A file input never resubmits its previous value, unlike the text
    // fields above - so avatarUrl is only touched when the member actually
    // picked a new photo or asked to remove the current one. Anything else
    // here would wipe the avatar on every unrelated profile save.
    const avatarFile = formData.get("avatar");
    if (avatarFile instanceof File && avatarFile.size > 0) {
      const bytes = Buffer.from(await avatarFile.arrayBuffer());
      let webp: Buffer;
      try {
        webp = await processAvatarImage(bytes);
      } catch (err) {
        // A code, not prose: EditProfileForm looks it up against the
        // "dashboard.avatarError*" keys to render it in the member's own
        // language.
        const code =
          err instanceof InvalidImageError ? err.code : "processing_failed";
        return { success: false, error: code };
      }
      await putAvatar(auth.member.id, webp);
      update.avatarUrl = AVATAR_SERVE_PATH;
    } else if (formData.get("removeAvatar") === "on") {
      await deleteAvatar(auth.member.id);
      update.avatarUrl = null;
    }

    await upsertProfile(db, auth.member.id, update);

    revalidatePath("/dashboard/profile");
    return { success: true };
  } catch (err) {
    if (err instanceof z.ZodError)
      return { success: false, error: err.issues[0]?.message };
    return { success: false, error: "Failed to update profile" };
  }
}

// --- FR-008: Update personal info (name, language, country) ---

const personalInfoSchema = z.object({
  displayName: z.string().min(1).max(255),
  language: z.enum(["en", "uk", "ru"]),
  country: z.string().length(2),
});

export async function updatePersonalInfoAction(
  _prevState: ProfileFormState | null,
  formData: FormData,
): Promise<ProfileFormState> {
  try {
    const auth = await getCurrentMember();
    if (!auth || !auth.member) {
      return { success: false, error: "Unauthorized" };
    }

    const actor = buildActor(auth.member);
    assertCan(actor, "update", "own_profile");

    const data = personalInfoSchema.parse({
      displayName: formData.get("displayName"),
      language: formData.get("language"),
      country: formData.get("country"),
    });

    await updateMemberPersonalInfo(db, auth.member.id, data);

    // FR-091: the saved preference is the first source of the locale, so a
    // change to it has to reach the cookie next-intl reads - otherwise the
    // member sets Russian and keeps being served whatever their browser asks
    // for.
    const localeCookie = localeCookieOptions(data.language);
    if (localeCookie) {
      const cookieStore = await cookies();
      cookieStore.set(localeCookie.name, localeCookie.value, {
        maxAge: localeCookie.maxAge,
        sameSite: localeCookie.sameSite,
        path: localeCookie.path,
      });
    }

    revalidatePath("/dashboard/profile");
    return { success: true };
  } catch (err) {
    if (err instanceof z.ZodError)
      return { success: false, error: err.issues[0]?.message };
    return { success: false, error: "Failed to update personal info" };
  }
}

// --- FR-011: Phone change with dual verification ---

export type PhoneChangeState = {
  step: "idle" | "verify_old" | "verify_new" | "done";
  error?: string;
  newPhone?: string;
};

export async function initiatePhoneChangeAction(
  _prevState: PhoneChangeState,
  formData: FormData,
): Promise<PhoneChangeState> {
  try {
    const auth = await getCurrentMember();
    if (!auth?.member) {
      return { step: "idle", error: "Unauthorized" };
    }

    const actor = buildActor(auth.member);
    assertCan(actor, "update", "own_profile");

    const newPhone = phoneSchema.parse(formData.get("newPhone"));

    if (newPhone === auth.member.phone) {
      return { step: "idle", error: "New phone is the same as current phone" };
    }

    const existing = await findMemberByPhone(db, newPhone);
    if (existing) {
      return { step: "idle", error: "This phone number is already registered" };
    }

    const sent = await sendVerificationCode(auth.member.phone);
    if (!sent) {
      return { step: "idle", error: "Failed to send verification code" };
    }

    return { step: "verify_old", newPhone };
  } catch (err) {
    if (err instanceof z.ZodError)
      return { step: "idle", error: err.issues[0]?.message };
    return { step: "idle", error: "Failed to initiate phone change" };
  }
}

export async function verifyOldPhoneAction(
  _prevState: PhoneChangeState,
  formData: FormData,
): Promise<PhoneChangeState> {
  try {
    const auth = await getCurrentMember();
    if (!auth?.member) {
      return { step: "idle", error: "Unauthorized" };
    }

    const actor = buildActor(auth.member);
    assertCan(actor, "update", "own_profile");

    const code = z.string().length(6).parse(formData.get("code"));
    const newPhone = phoneSchema.parse(formData.get("newPhone"));

    const valid = await checkVerificationCode(auth.member.phone, code);
    if (!valid) {
      return { step: "verify_old", newPhone, error: "Invalid code" };
    }

    const sent = await sendVerificationCode(newPhone);
    if (!sent) {
      return {
        step: "verify_old",
        newPhone,
        error: "Failed to send code to new number",
      };
    }

    return { step: "verify_new", newPhone };
  } catch (err) {
    if (err instanceof z.ZodError)
      return { step: "idle", error: err.issues[0]?.message };
    return { step: "idle", error: "Verification failed" };
  }
}

export async function verifyNewPhoneAction(
  _prevState: PhoneChangeState,
  formData: FormData,
): Promise<PhoneChangeState> {
  try {
    const auth = await getCurrentMember();
    if (!auth?.member) {
      return { step: "idle", error: "Unauthorized" };
    }

    const actor = buildActor(auth.member);
    assertCan(actor, "update", "own_profile");

    const code = z.string().length(6).parse(formData.get("code"));
    const newPhone = phoneSchema.parse(formData.get("newPhone"));

    const existing = await findMemberByPhone(db, newPhone);
    if (existing) {
      return { step: "idle", error: "This phone number is already registered" };
    }

    const valid = await checkVerificationCode(newPhone, code);
    if (!valid) {
      return { step: "verify_new", newPhone, error: "Invalid code" };
    }

    const oldPhone = auth.member.phone;
    await updateMemberPhone(db, auth.member.id, newPhone);

    await appendAuditEntry(db, {
      actorType: "member",
      actorId: auth.member.id,
      action: "member.phone_changed",
      subjectType: "member",
      subjectId: auth.member.id,
      meta: { oldPhone, newPhone },
    });

    revalidatePath("/dashboard/profile");
    return { step: "done" };
  } catch (err) {
    if (err instanceof z.ZodError)
      return { step: "idle", error: err.issues[0]?.message };
    return { step: "idle", error: "Phone change failed" };
  }
}

export async function requestAccountDeletionAction(formData: FormData) {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    throw new Error("Unauthorized");
  }

  const actor = buildActor(auth.member);
  assertCan(actor, "delete", "own_profile");

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

  // The avatar is not deleted here. This only starts the 30-day clock
  // (data-storage.md §4); the actual erasure - including the R2 object -
  // runs in eraseMemberTx's caller (src/app/api/cron/retention/route.ts) at
  // day 30, same as every other piece of this member's data.

  const cookieStore = await cookies();
  cookieStore.delete("session");

  redirect(`/${auth.member.language || "en"}/login`);
}
