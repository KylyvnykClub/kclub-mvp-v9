"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/data/db";
import {
  countInvitationsByInviter,
  ensureInviteLink,
  listActiveInviteLinks,
  loadInviterStanding,
  rotateInviteLink,
} from "@/data/invite-links";
import { buildActor } from "@/domain/actor";
import { assertCan } from "@/domain/authorization";
import {
  INVITE_LINK_KINDS,
  inviteGrantsWaiver,
  type InviteLinkKind,
  type InviterStanding,
} from "@/domain/invites";
import { getCurrentMember } from "./session";

/**
 * The member's own invite links (FR-122, FR-125, ADR 0042).
 *
 * Scoped by the session's member id and nothing else. What comes back is the
 * member's links and two numbers: never who came through them (ADR 0005).
 */

const kindSchema = z.enum(["member", "partner"]);

export type InviteProgramme = {
  standing: InviterStanding;
  links: { kind: InviteLinkKind; code: string; waived: boolean }[];
  counts: Record<InviteLinkKind, number>;
};

/** 12 random bytes: 16 characters in the URL, unguessable, nothing inside. */
function newCode(): string {
  return randomBytes(12).toString("base64url");
}

async function memberActor(action: "read" | "update") {
  const auth = await getCurrentMember();
  if (!auth?.member) return null;

  assertCan(buildActor(auth.member), action, "own_invite_link");
  return auth.member;
}

/**
 * The cabinet's view. Links are hung on first sight rather than at
 * registration, so members who joined before the programme get them too.
 * Null for a member outside the club: their link would do nothing, so it is
 * not shown.
 */
export async function getMyInviteProgrammeAction(): Promise<InviteProgramme | null> {
  const member = await memberActor("read");
  if (!member) return null;

  const standing = await loadInviterStanding(db, member.id, new Date());
  if (!standing) return null;

  let links = await listActiveInviteLinks(db, member.id);
  const missing = INVITE_LINK_KINDS.filter(
    (kind) => !links.some((link) => link.kind === kind),
  );
  if (missing.length > 0) {
    for (const kind of missing) {
      await ensureInviteLink(db, member.id, kind, newCode());
    }
    links = await listActiveInviteLinks(db, member.id);
  }

  return {
    standing,
    links: INVITE_LINK_KINDS.flatMap((kind) => {
      const link = links.find((row) => row.kind === kind);
      return link
        ? [
            {
              kind,
              code: link.code,
              waived: inviteGrantsWaiver(standing, kind),
            },
          ]
        : [];
    }),
    counts: await countInvitationsByInviter(db, member.id),
  };
}

/** A new link of this kind; the old one stops working at once. */
export async function rotateMyInviteLinkAction(
  kind: InviteLinkKind,
): Promise<{ success: boolean; code?: string }> {
  const member = await memberActor("update");
  if (!member) return { success: false };

  const parsedKind = kindSchema.parse(kind);
  // A member outside the club has no programme to rotate.
  if (!(await loadInviterStanding(db, member.id, new Date()))) {
    return { success: false };
  }

  const link = await rotateInviteLink(
    db,
    member.id,
    parsedKind,
    newCode(),
    new Date(),
  );

  revalidatePath("/dashboard/profile");
  return { success: true, code: link.code };
}
