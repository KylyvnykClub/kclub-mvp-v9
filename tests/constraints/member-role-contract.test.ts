import { describe, expect, it } from "vitest";

import { memberRoleEnum } from "@/data/schema/members.js";
import {
  buildActor,
  normalizeRole,
  type CompatiblePersistedRole,
} from "@/domain/actor.js";

const expectedPersistedRoles = [
  "user",
  "admin",
  "member",
  "member_vip",
  "partner_owner",
  "staff_support",
  "staff_moderator",
  "staff_admin",
  "staff_owner",
] satisfies CompatiblePersistedRole[];

describe("constraint: member role persistence contract", () => {
  it("keeps the database enum compatible with legacy and domain actor roles", () => {
    expect(memberRoleEnum.enumValues).toEqual(expectedPersistedRoles);
  });

  it("maps every persisted member role to the expected domain actor shape", () => {
    expect(
      expectedPersistedRoles.map((role) => [
        role,
        normalizeRole(role),
        buildActor({ id: role, role }).type,
      ]),
    ).toEqual([
      ["user", "member", "member"],
      ["admin", "staff_owner", "staff"],
      ["member", "member", "member"],
      ["member_vip", "member_vip", "member"],
      ["partner_owner", "partner_owner", "partner_owner"],
      ["staff_support", "staff_support", "staff"],
      ["staff_moderator", "staff_moderator", "staff"],
      ["staff_admin", "staff_admin", "staff"],
      ["staff_owner", "staff_owner", "staff"],
    ]);
  });
});
