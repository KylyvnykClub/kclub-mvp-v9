"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember } from "./session";
import { db } from "@/data/db";
import { appendAuditEntry } from "@/data/audit-log";
import { deleteSessionsByMemberId } from "@/data/identity";
import {
  clearStaffTotpEnrolment,
  createStaffMember,
  findStaffMemberById,
  setStaffMemberRole,
  setStaffMemberStatus,
} from "@/data/staff";
import { buildActor, normalizeRole, STAFF_ROLES } from "@/domain/actor";
import { can } from "@/domain/authorization";
import { hashPassword } from "@/modules/identity/crypto";
import { phoneSchema } from "@/lib/phone";

const staffRoleSchema = z.enum(STAFF_ROLES);

const createStaffSchema = z.object({
  phone: phoneSchema,
  displayName: z.string().trim().min(2).max(255),
  password: z.string().min(12).max(100),
  role: staffRoleSchema,
  country: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase()),
  language: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toLowerCase()),
});

const setRoleSchema = z.object({
  staffId: z.string().uuid(),
  role: staffRoleSchema,
});

async function requireStaffOwner() {
  const session = await getCurrentMember();
  if (!session?.member) {
    throw new Error("Unauthorized");
  }

  const actor = buildActor(session.member);
  if (!can(actor, "manage_staff", "staff_user")) {
    throw new Error("Unauthorized");
  }

  return {
    id: session.member.id,
    role: normalizeRole(session.member.role),
  };
}

async function auditStaffChange(input: {
  actor: { id: string; role: string };
  action: string;
  subjectId: string;
  before?: unknown;
  after?: unknown;
}) {
  await appendAuditEntry(db, {
    actorType: input.actor.role,
    actorId: input.actor.id,
    action: input.action,
    subjectType: "staff_user",
    subjectId: input.subjectId,
    meta: {
      before: input.before ?? null,
      after: input.after ?? null,
    },
  });
}

export async function createStaffAction(formData: FormData) {
  const actor = await requireStaffOwner();
  const input = createStaffSchema.parse({
    phone: formData.get("phone"),
    displayName: formData.get("displayName"),
    password: formData.get("password"),
    role: formData.get("role"),
    country: formData.get("country"),
    language: formData.get("language"),
  });

  const staffMember = await createStaffMember(db, {
    phone: input.phone,
    passwordHash: await hashPassword(input.password),
    displayName: input.displayName,
    role: input.role,
    country: input.country,
    language: input.language,
  });

  await auditStaffChange({
    actor,
    action: "create_staff",
    subjectId: staffMember.id,
    after: {
      phone: staffMember.phone,
      displayName: staffMember.displayName,
      role: staffMember.role,
      status: staffMember.status,
    },
  });

  revalidatePath("/dashboard/admin/staff");
}

export async function setStaffRoleAction(formData: FormData) {
  const actor = await requireStaffOwner();
  const input = setRoleSchema.parse({
    staffId: formData.get("staffId"),
    role: formData.get("role"),
  });

  const before = await findStaffMemberById(db, input.staffId);
  const updated = await setStaffMemberRole(db, {
    actorId: actor.id,
    staffId: input.staffId,
    role: input.role,
  });

  if (!updated) {
    throw new Error("Staff member not found");
  }

  await auditStaffChange({
    actor,
    action: "set_staff_role",
    subjectId: input.staffId,
    before: { role: before?.role ?? null },
    after: { role: updated.role },
  });

  revalidatePath("/dashboard/admin/staff");
}

export async function setStaffStatusAction(
  staffId: string,
  currentStatus: string,
) {
  const actor = await requireStaffOwner();
  const newStatus = currentStatus === "active" ? "blocked" : "active";
  const before = await findStaffMemberById(db, staffId);
  const updated = await setStaffMemberStatus(db, {
    actorId: actor.id,
    staffId,
    status: newStatus,
  });

  if (!updated) {
    throw new Error("Staff member not found");
  }

  if (newStatus === "blocked") {
    await deleteSessionsByMemberId(db, staffId);
  }

  await auditStaffChange({
    actor,
    action: newStatus === "blocked" ? "disable_staff" : "enable_staff",
    subjectId: staffId,
    before: { status: before?.status ?? null },
    after: { status: updated.status },
  });

  revalidatePath("/dashboard/admin/staff");
}

/**
 * Discard a staff member's authenticator so they can enrol a new one
 * (FR-080, ADR 0016).
 *
 * The case this exists for: the seed in someone's authenticator app stops
 * matching the one on the server — a phone replaced, an entry made against a
 * different database, or a seed reissued when ADR 0016 discarded the plaintext
 * ones. The symptom is that every code is rejected, forever, and until now the
 * only cure was a SQL statement typed against production.
 *
 * Owner-only, and for the same reason the password reset is: whoever can clear
 * a second factor can stand in front of the account it protects. It is gated
 * on `reset_password` rather than `manage_staff` deliberately — this is the
 * same capability, not staff administration.
 *
 * Every session of that staff member ends with it. If the reason for the reset
 * is a lost or stolen authenticator, a live session is the thing an attacker
 * still holds; if it is a mismatched seed, there is nothing to lose because
 * they could not sign in anyway.
 */
export async function resetStaffTotpAction(staffId: string) {
  const session = await getCurrentMember();

  if (!session?.member) {
    throw new Error("Unauthorized");
  }

  const actor = buildActor(session.member);

  if (!can(actor, "reset_password", "member")) {
    throw new Error("Unauthorized");
  }

  const before = await findStaffMemberById(db, staffId);
  const cleared = await clearStaffTotpEnrolment(db, staffId);

  if (!cleared) {
    throw new Error("Staff member not found");
  }

  await deleteSessionsByMemberId(db, staffId);

  await auditStaffChange({
    actor: { id: session.member.id, role: normalizeRole(session.member.role) },
    action: "reset_staff_totp",
    subjectId: staffId,
    // The seed itself is never recorded, here or anywhere: what matters for
    // the record is that an enrolment was discarded and by whom.
    before: { totpEnabled: before?.totpEnabled ?? null },
    after: { totpEnabled: false, sessionsRevoked: true },
  });

  revalidatePath("/dashboard/admin/staff");
}
