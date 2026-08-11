export const ROLES = [
  "guest",
  "member",
  "member_vip",
  "partner_owner",
  "staff_support",
  "staff_moderator",
  "staff_admin",
  "staff_owner",
  "system",
] as const;

export type Role = (typeof ROLES)[number];
export type PersistedRole = Role | "user" | "admin";

export type Actor =
  | { type: "guest" }
  | { type: "member"; id: string; role: "member" | "member_vip" }
  | { type: "partner_owner"; id: string; companyIds: string[] }
  | {
      type: "staff";
      id: string;
      role: "staff_support" | "staff_moderator" | "staff_admin" | "staff_owner";
    }
  | { type: "system" };

export type ActorType = Actor["type"];

const STAFF_RANK: Record<string, number> = {
  staff_support: 1,
  staff_moderator: 2,
  staff_admin: 3,
  staff_owner: 4,
};

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

export function staffAtLeast(
  actor: Actor,
  minimumRole:
    "staff_support" | "staff_moderator" | "staff_admin" | "staff_owner",
): boolean {
  if (!isStaff(actor)) return false;
  // eslint-disable-next-line security/detect-object-injection
  return (STAFF_RANK[actor.role] ?? 0) >= (STAFF_RANK[minimumRole] ?? 0);
}

export function actorId(actor: Actor): string | null {
  if (actor.type === "guest" || actor.type === "system") return null;
  return actor.id;
}

export function normalizeRole(role: PersistedRole): Role {
  if (role === "user") return "member";
  if (role === "admin") return "staff_owner";
  return role;
}

export function buildActor(member: { id: string; role: PersistedRole }): Actor {
  const role = normalizeRole(member.role);

  if (role.startsWith("staff_")) {
    return {
      type: "staff",
      id: member.id,
      role: role as Extract<Role, `staff_${string}`>,
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

  return {
    type: "member",
    id: member.id,
    role: role as "member" | "member_vip",
  };
}
