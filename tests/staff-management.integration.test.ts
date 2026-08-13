import { describe, expect, it } from "vitest";
import type { DbClient } from "@/data/db.js";
import {
  createStaffMember,
  listStaffMembers,
  setStaffMemberRole,
  setStaffMemberStatus,
} from "@/data/staff.js";
import { getTestDb } from "./setup/integration-setup.js";

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

async function seedStaff(
  db: DbClient,
  input: {
    phoneSuffix: string;
    role?: "staff_support" | "staff_moderator" | "staff_admin" | "staff_owner";
  },
) {
  return createStaffMember(db, {
    phone: `+15557${input.phoneSuffix}`,
    passwordHash: "hash",
    displayName: `Staff ${input.phoneSuffix}`,
    role: input.role ?? "staff_support",
    country: "US",
    language: "en",
  });
}

describe("staff management (FR-086)", () => {
  it("creates and lists staff accounts without returning member accounts", async () => {
    const db = testDbClient();
    const staff = await seedStaff(db, {
      phoneSuffix: "100001",
      role: "staff_moderator",
    });

    const rows = await listStaffMembers(db);

    expect(rows.map((row) => row.id)).toContain(staff.id);
    expect(rows.every((row) => row.role.startsWith("staff_"))).toBe(true);
  });

  it("lets another staff owner disable and re-enable staff accounts", async () => {
    const db = testDbClient();
    const owner = await seedStaff(db, {
      phoneSuffix: "100002",
      role: "staff_owner",
    });
    const staff = await seedStaff(db, { phoneSuffix: "100003" });

    const disabled = await setStaffMemberStatus(db, {
      actorId: owner.id,
      staffId: staff.id,
      status: "blocked",
    });
    expect(disabled?.status).toBe("blocked");

    const enabled = await setStaffMemberStatus(db, {
      actorId: owner.id,
      staffId: staff.id,
      status: "active",
    });
    expect(enabled?.status).toBe("active");
  });

  it("changes another staff account role but blocks self role changes", async () => {
    const db = testDbClient();
    const owner = await seedStaff(db, {
      phoneSuffix: "100004",
      role: "staff_owner",
    });
    const staff = await seedStaff(db, { phoneSuffix: "100005" });

    const promoted = await setStaffMemberRole(db, {
      actorId: owner.id,
      staffId: staff.id,
      role: "staff_admin",
    });
    expect(promoted?.role).toBe("staff_admin");

    await expect(
      setStaffMemberRole(db, {
        actorId: owner.id,
        staffId: owner.id,
        role: "staff_support",
      }),
    ).rejects.toThrow(/cannot change their own role/);
  });

  it("blocks self disable attempts", async () => {
    const db = testDbClient();
    const owner = await seedStaff(db, {
      phoneSuffix: "100006",
      role: "staff_owner",
    });

    await expect(
      setStaffMemberStatus(db, {
        actorId: owner.id,
        staffId: owner.id,
        status: "blocked",
      }),
    ).rejects.toThrow(/cannot change their own status/);
  });
});
