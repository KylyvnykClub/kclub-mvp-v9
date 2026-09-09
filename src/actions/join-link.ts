"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { appendAuditEntry } from "@/data/audit-log";
import { db } from "@/data/db";
import {
  findActiveJoinLink,
  revokeActiveJoinLink,
  rotateJoinLink,
} from "@/data/join-links";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import { getCurrentMember } from "./session";

/**
 * The owner's control over the join link (FR-106, ADR 0033).
 *
 * Every function here is owner-only and every mutation writes an audit entry:
 * rotating the link changes who can get in free, which is exactly the kind of
 * act the log exists for. The secret itself is never written to the log — the
 * entry names the link's id, so the record says a link was rotated without
 * putting the key in a second, longer-lived place.
 */

async function ownerOrThrow() {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    throw new Error("Unauthorized");
  }

  const actor = buildActor(auth.member);
  if (!can(actor, "manage_join_link", "join_link")) {
    throw new Error("Unauthorized");
  }

  return auth.member;
}

async function requestContext() {
  const headerList = await headers();

  return {
    ip: headerList.get("x-forwarded-for")?.split(",")[0] ?? null,
    userAgent: headerList.get("user-agent") ?? null,
  };
}

export async function getJoinLinkAction() {
  await ownerOrThrow();

  const link = await findActiveJoinLink(db);
  if (!link) return null;

  return {
    id: link.id,
    secret: link.secret,
    createdAt: link.createdAt,
  };
}

/**
 * A new door, and the old one closed. 16 bytes of randomness: long enough that
 * guessing is hopeless, short enough to read down a phone.
 */
export async function rotateJoinLinkAction() {
  const member = await ownerOrThrow();
  const context = await requestContext();

  const link = await rotateJoinLink(
    db,
    randomBytes(16).toString("base64url"),
    member.id,
  );

  await appendAuditEntry(db, {
    actorType: "staff",
    actorId: member.id,
    action: "manage_join_link",
    subjectType: "join_link",
    subjectId: link.id,
    meta: { operation: "rotate" },
    ip: context.ip,
    userAgent: context.userAgent,
  });

  revalidatePath("/dashboard/admin/join-link");

  return { id: link.id, secret: link.secret, createdAt: link.createdAt };
}

export async function revokeJoinLinkAction() {
  const member = await ownerOrThrow();
  const context = await requestContext();

  const existing = await findActiveJoinLink(db);
  const revoked = await revokeActiveJoinLink(db);

  if (revoked && existing) {
    await appendAuditEntry(db, {
      actorType: "staff",
      actorId: member.id,
      action: "manage_join_link",
      subjectType: "join_link",
      subjectId: existing.id,
      meta: { operation: "revoke" },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  revalidatePath("/dashboard/admin/join-link");

  return { revoked };
}
