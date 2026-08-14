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
import { updateMemberPersonalInfo, updateMemberPhone } from "@/data/members";
import { findMemberByPhone } from "@/data/identity";
import { appendAuditEntry } from "@/data/audit-log";
import { getCurrentMember } from "@/actions/session";
import { buildActor } from "@/domain/actor";
import { assertCan } from "@/domain/authorization";
import {
  sendVerificationCode,
  checkVerificationCode,
} from "@/modules/identity/twilio";
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

    const actor = buildActor(auth.member);
    assertCan(actor, "update", "own_profile");

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

const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, "Must be E.164 format");

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

  const cookieStore = await cookies();
  cookieStore.delete("session");

  redirect(`/${auth.member.language || "en"}/login`);
}
