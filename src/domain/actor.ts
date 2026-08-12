export const MEMBER_ROLES = ["member", "member_vip"] as const;
export const STAFF_ROLES = [
  "staff_support",
  "staff_moderator",
  "staff_admin",
  "staff_owner",
] as const;

export const ROLES = [
  "guest",
  ...MEMBER_ROLES,
  "partner_owner",
  ...STAFF_ROLES,
  "system",
] as const;

export type Role = (typeof ROLES)[number];
export type MemberRole = (typeof MEMBER_ROLES)[number];
export type StaffRole = (typeof STAFF_ROLES)[number];
export type PersistedRole = MemberRole | "partner_owner" | StaffRole;
export type LegacyPersistedRole = "user" | "admin";
export type CompatiblePersistedRole = PersistedRole | LegacyPersistedRole;

export type Actor =
  | { type: "guest" }
  | { type: "member"; id: string; role: MemberRole }
  | { type: "partner_owner"; id: string; companyIds: string[] }
  | {
      type: "staff";
      id: string;
      role: StaffRole;
    }
  | { type: "system" };

export type ActorType = Actor["type"];

const STAFF_RANK: Record<string, number> = {
  staff_support: 1,
  staff_moderator: 2,
  staff_admin: 3,
  staff_owner: 4,
};

export function isStaffRole(role: CompatiblePersistedRole): role is StaffRole {
  return (
    role === "staff_support" ||
    role === "staff_moderator" ||
    role === "staff_admin" ||
    role === "staff_owner"
  );
}

function isMemberRole(role: CompatiblePersistedRole): role is MemberRole {
  return role === "member" || role === "member_vip";
}

export function isStaff(
  actor: Actor,
): actor is Extract<Actor, { type: "staff" }> {
  return actor.type === "staff";
}

export function isAuthenticated(
  actor: Actor,
): actor is Exclude<Actor, { type: "guest" }> {
  return actor.type !== "guest";
}

export function staffAtLeast(actor: Actor, minimumRole: StaffRole): boolean {
  if (!isStaff(actor)) return false;
  // eslint-disable-next-line security/detect-object-injection
  return (STAFF_RANK[actor.role] ?? 0) >= (STAFF_RANK[minimumRole] ?? 0);
}

export function actorId(actor: Actor): string | null {
  if (actor.type === "guest" || actor.type === "system") return null;
  return actor.id;
}

export function normalizeRole(role: CompatiblePersistedRole): PersistedRole {
  if (role === "user") return "member";
  if (role === "admin") return "staff_owner";
  return role;
}

export function buildActor(member: {
  id: string;
  role: CompatiblePersistedRole;
}): Actor {
  const role = normalizeRole(member.role);

  if (isStaffRole(role)) {
    return {
      type: "staff",
      id: member.id,
      role,
    };
  }

  // Note: partner_owner will require injecting companyIds in the future
  if (role === "partner_owner") {
    return {
      type: "partner_owner",
      id: member.id,
      companyIds: [],
    };
  }

  if (!isMemberRole(role)) {
    throw new Error("Unsupported persisted member role");
  }

  return {
    type: "member",
    id: member.id,
    role,
  };
}
