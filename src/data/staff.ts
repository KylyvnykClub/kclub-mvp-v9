import { and, asc, eq, inArray } from "drizzle-orm";

import type { DbClient } from "./db";
import { members } from "./schema";
import { STAFF_ROLES, type StaffRole } from "@/domain/actor";

export type StaffStatus = "active" | "blocked";

export async function listStaffMembers(db: DbClient) {
  return db.query.members.findMany({
    where: inArray(members.role, STAFF_ROLES),
    orderBy: [asc(members.displayName)],
  });
}

export type StaffMemberView = Awaited<
  ReturnType<typeof listStaffMembers>
>[number];

export async function findStaffMemberById(db: DbClient, staffId: string) {
  return db.query.members.findFirst({
    where: and(eq(members.id, staffId), inArray(members.role, STAFF_ROLES)),
  });
}

export async function createStaffMember(
  db: DbClient,
  input: {
    phone: string;
    passwordHash: string;
    displayName: string;
    role: StaffRole;
    country: string;
    language: string;
  },
) {
  const [staffMember] = await db
    .insert(members)
    .values({
      phone: input.phone,
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      role: input.role,
      country: input.country,
      language: input.language,
      status: "active",
    })
    .returning();

  return staffMember!;
}

/**
 * Discard a staff member's enrolled authenticator (FR-080, ADR 0016).
 *
 * Clears the seed and the enrolment flag together, which is what puts the
 * account back into the enrolment path: `IdentityService.login` generates a
 * fresh seed for a staff member who has none, and the next sign-in shows the
 * QR code again.
 *
 * Scoped to staff roles like every other function here. Members do not hold a
 * second factor, so a call naming one is a mistake rather than a no-op worth
 * allowing silently.
 *
 * Returns the row when one was cleared, `null` when the id named nobody -
 * telling a real reset from a reset of somebody who is not there.
 */
export async function clearStaffTotpEnrolment(db: DbClient, staffId: string) {
  const [staffMember] = await db
    .update(members)
    .set({ totpSecret: null, totpEnabled: false })
    .where(and(eq(members.id, staffId), inArray(members.role, STAFF_ROLES)))
    .returning();

  return staffMember ?? null;
}

export async function setStaffMemberStatus(
  db: DbClient,
  input: {
    actorId: string;
    staffId: string;
    status: StaffStatus;
  },
) {
  if (input.actorId === input.staffId) {
    throw new Error("A staff member cannot change their own status");
  }

  const [staffMember] = await db
    .update(members)
    .set({ status: input.status })
    .where(
      and(eq(members.id, input.staffId), inArray(members.role, STAFF_ROLES)),
    )
    .returning();

  return staffMember ?? null;
}

export async function setStaffMemberRole(
  db: DbClient,
  input: {
    actorId: string;
    staffId: string;
    role: StaffRole;
  },
) {
  if (input.actorId === input.staffId) {
    throw new Error("A staff member cannot change their own role");
  }

  const [staffMember] = await db
    .update(members)
    .set({ role: input.role })
    .where(
      and(eq(members.id, input.staffId), inArray(members.role, STAFF_ROLES)),
    )
    .returning();

  return staffMember ?? null;
}
