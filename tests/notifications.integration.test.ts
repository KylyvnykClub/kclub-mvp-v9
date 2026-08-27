import { describe, expect, it } from "vitest";
import type { DbClient } from "@/data/db.js";
import {
  NOTIFICATION_RETENTION_DAYS,
  countNotificationsForMember,
  countUnreadForMember,
  createNotification,
  deleteExpiredNotifications,
  listNotificationsForMember,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/data/notifications.js";
import { eraseMemberTx } from "@/data/account-erasure.js";
import { members, notifications } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";
import { eq } from "drizzle-orm";

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

async function seedMember(db: DbClient) {
  const [member] = await db
    .insert(members)
    .values({
      phone: `+1${Math.floor(1_000_000_000 + Math.random() * 9_000_000_000)}`,
      passwordHash: "hash",
      displayName: "Inbox Member",
      country: "US",
      language: "en",
    })
    .returning();

  return member!;
}

describe("FR-099: the member inbox", () => {
  it("FR-099: returns only the caller's own notifications", async () => {
    const db = testDbClient();
    const mine = await seedMember(db);
    const theirs = await seedMember(db);

    await createNotification(db, { memberId: mine.id, kind: "welcome" });
    await createNotification(db, {
      memberId: theirs.id,
      kind: "company_approved",
      params: { companyName: "Not Yours" },
    });

    const rows = await listNotificationsForMember(db, mine.id);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("welcome");
    expect(rows.every((row) => row.memberId === mine.id)).toBe(true);
  });

  it("FR-099: counts unread for the badge, and stops counting once read", async () => {
    const db = testDbClient();
    const member = await seedMember(db);

    await createNotification(db, { memberId: member.id, kind: "welcome" });
    await createNotification(db, {
      memberId: member.id,
      kind: "payment_failed",
    });

    expect(await countUnreadForMember(db, member.id)).toBe(2);

    const [first] = await listNotificationsForMember(db, member.id);
    await markNotificationRead(db, member.id, first!.id, new Date());

    expect(await countUnreadForMember(db, member.id)).toBe(1);

    await markAllNotificationsRead(db, member.id, new Date());
    expect(await countUnreadForMember(db, member.id)).toBe(0);
  });

  it("FR-099: will not let one member mark another member's notification read", async () => {
    const db = testDbClient();
    const mine = await seedMember(db);
    const theirs = await seedMember(db);

    await createNotification(db, { memberId: theirs.id, kind: "welcome" });
    const [target] = await listNotificationsForMember(db, theirs.id);

    // The member id is part of the WHERE, so a guessed notification id matches
    // nothing rather than confirming that it exists (ADR 0005).
    await expect(
      markNotificationRead(db, mine.id, target!.id, new Date()),
    ).resolves.toBe(false);
    expect(await countUnreadForMember(db, theirs.id)).toBe(1);
  });

  it("FR-099: stores no prose, so a language change cannot strand a notification", async () => {
    const db = testDbClient();
    const member = await seedMember(db);

    await createNotification(db, {
      memberId: member.id,
      kind: "company_approved",
      params: { companyId: "abc", companyName: "Acme Coffee" },
    });

    const [row] = await listNotificationsForMember(db, member.id);

    // The kind selects the message and params fill its placeholders at read
    // time (FR-090). A rendered sentence would freeze whichever language was
    // current when the event happened.
    expect(row?.kind).toBe("company_approved");
    expect(row?.params).toEqual({
      companyId: "abc",
      companyName: "Acme Coffee",
    });
  });

  it("FR-099: a repeated dedupe key writes one row, so a redelivered event cannot duplicate", async () => {
    const db = testDbClient();
    const member = await seedMember(db);

    await createNotification(db, {
      memberId: member.id,
      kind: "referral_received",
      dedupeKey: `referral_received:${member.id}`,
    });
    await createNotification(db, {
      memberId: member.id,
      kind: "referral_received",
      dedupeKey: `referral_received:${member.id}`,
    });

    expect(await countNotificationsForMember(db, member.id)).toBe(1);
  });

  it("FR-099: rows without a dedupe key do not collide with each other", async () => {
    const db = testDbClient();
    const member = await seedMember(db);

    await createNotification(db, { memberId: member.id, kind: "welcome" });
    await createNotification(db, { memberId: member.id, kind: "welcome" });

    expect(await countNotificationsForMember(db, member.id)).toBe(2);
  });

  it("FR-099: the retention sweep deletes rows past the window, read or unread", async () => {
    const db = testDbClient();
    const member = await seedMember(db);

    await createNotification(db, { memberId: member.id, kind: "welcome" });
    const [row] = await listNotificationsForMember(db, member.id);

    const old = new Date(
      Date.now() - (NOTIFICATION_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000,
    );
    await db
      .update(notifications)
      .set({ createdAt: old })
      .where(eq(notifications.id, row!.id));

    const deleted = await deleteExpiredNotifications(db, new Date());

    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await countNotificationsForMember(db, member.id)).toBe(0);
  });

  it("FR-099: keeps rows inside the retention window", async () => {
    const db = testDbClient();
    const member = await seedMember(db);

    await createNotification(db, { memberId: member.id, kind: "welcome" });
    await deleteExpiredNotifications(db, new Date());

    expect(await countNotificationsForMember(db, member.id)).toBe(1);
  });

  /**
   * The trap this pins: `eraseMemberTx` anonymises the member row rather than
   * deleting it, so the ON DELETE CASCADE on member_id never fires. Without an
   * explicit delete the inbox outlives the person it describes.
   */
  it("FR-009: erasing a member deletes their inbox, which the cascade would not", async () => {
    const db = testDbClient();
    const member = await seedMember(db);

    await createNotification(db, { memberId: member.id, kind: "welcome" });
    await createNotification(db, {
      memberId: member.id,
      kind: "company_rejected",
      params: { companyName: "Acme", reason: "Not a fit" },
    });
    expect(await countNotificationsForMember(db, member.id)).toBe(2);

    await eraseMemberTx(db, member.id, new Date());

    expect(await countNotificationsForMember(db, member.id)).toBe(0);
  });
});
