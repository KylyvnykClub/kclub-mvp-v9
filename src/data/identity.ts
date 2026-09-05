import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, ne, or } from "drizzle-orm";

import { appendAuditEntry } from "./audit-log";
import type { DbClient } from "./db";
import {
  cards,
  legalAcceptances,
  members,
  notifications,
  memberIdentities,
  sessions,
  verificationTokens,
} from "./schema";
import type { IdentityProvider, VerificationPurpose } from "./schema";
import { createCardPublicTokenWithEnv, hashCardToken } from "@/lib/card-token";
import { hashSessionToken } from "@/lib/session-token";

function sessionTokenLookup(token: string) {
  const tokenHash = hashSessionToken(token);

  return or(eq(sessions.tokenHash, tokenHash), eq(sessions.token, token));
}

export async function findMemberByPhone(db: DbClient, phone: string) {
  return db.query.members.findFirst({
    where: eq(members.phone, phone),
  });
}

/**
 * The member holding an address (FR-001, ADR 0032).
 *
 * Matches on the address as stored, which `emailSchema` has already lowercased
 * — the callers of this function pass its output, so there is no second
 * opinion about case here.
 */
export async function findMemberByEmail(db: DbClient, email: string) {
  return db.query.members.findFirst({
    where: eq(members.email, email),
  });
}

export interface RegisterMemberInput {
  phone: string;
  /** Claimed at registration, unverified until the emailed link is opened. */
  email: string | null;
  /**
   * Set only where the address arrived already proved — today that means
   * Google vouched for it in the same request (ADR 0029).
   */
  emailVerifiedAt?: Date | null;
  /** Linked in the same transaction, so a half-registered member cannot exist. */
  identity?: { provider: IdentityProvider; providerAccountId: string };
  passwordHash: string;
  displayName: string;
  country: string;
  language: string;
  userAgent: string;
  ipAddress: string;
  consents: Array<{ documentId: string; version: string }>;
  cardSerial: string;
  sessionToken: string;
}

/** Returns the new member's id, which the caller needs to send them anything. */
export async function registerMemberTx(
  db: DbClient,
  input: RegisterMemberInput,
): Promise<string> {
  return db.transaction(async (tx) => {
    const [member] = await tx
      .insert(members)
      .values({
        phone: input.phone,
        email: input.email,
        emailVerifiedAt: input.emailVerifiedAt ?? null,
        passwordHash: input.passwordHash,
        displayName: input.displayName,
        country: input.country,
        language: input.language,
      })
      .returning();

    if (input.consents.length > 0) {
      await tx.insert(legalAcceptances).values(
        input.consents.map((c) => ({
          memberId: member!.id,
          documentId: c.documentId,
          version: c.version,
        })),
      );
    }

    if (input.identity) {
      await tx.insert(memberIdentities).values({
        memberId: member!.id,
        provider: input.identity.provider,
        providerAccountId: input.identity.providerAccountId,
      });
    }

    const cardId = randomUUID();
    const cardTokenHash = hashCardToken(createCardPublicTokenWithEnv(cardId));

    await tx.insert(cards).values({
      id: cardId,
      memberId: member!.id,
      serial: input.cardSerial,
      token: cardTokenHash,
      tokenHash: cardTokenHash,
      tier: "free",
    });

    const sessionTokenHash = hashSessionToken(input.sessionToken);

    await tx.insert(sessions).values({
      memberId: member!.id,
      token: sessionTokenHash,
      tokenHash: sessionTokenHash,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    });

    // The first thing in the new member's inbox (FR-099, ADR 0020), written in
    // the registration transaction as architecture.md §3.1 has always specified
    // - a welcome that could arrive without an account, or an account without
    // its welcome, is worth neither.
    await tx.insert(notifications).values({
      memberId: member!.id,
      kind: "welcome",
      dedupeKey: `welcome:${member!.id}`,
    });

    await appendAuditEntry(tx, {
      actorType: "member",
      actorId: member!.id,
      action: "member.registered",
      subjectType: "member",
      subjectId: member!.id,
      ip: input.ipAddress,
      userAgent: input.userAgent,
    });

    return member!.id;
  });
}

export async function createSessionTx(
  db: DbClient,
  input: {
    memberId: string;
    sessionToken: string;
    userAgent: string;
    ipAddress: string;
    isPartialSession?: boolean;
    /** Encrypted seed for a staff member mid-enrolment. Never plaintext. */
    pendingTotpSecret?: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const sessionTokenHash = hashSessionToken(input.sessionToken);

    await tx.insert(sessions).values({
      memberId: input.memberId,
      token: sessionTokenHash,
      tokenHash: sessionTokenHash,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      isPartialSession: input.isPartialSession ?? false,
      pendingTotpSecret: input.pendingTotpSecret ?? null,
    });

    await appendAuditEntry(tx, {
      actorType: "member",
      actorId: input.memberId,
      action: "member.logged_in",
      subjectType: "member",
      subjectId: input.memberId,
      ip: input.ipAddress,
      userAgent: input.userAgent,
    });
  });
}

export async function findActiveSessionByToken(db: DbClient, token: string) {
  const session = await db.query.sessions.findFirst({
    where: sessionTokenLookup(token),
    with: {
      member: true,
    },
  });

  if (!session || !session.member) {
    return null;
  }

  if (session.member.status !== "active") {
    return null;
  }

  return session;
}

export async function deleteSessionByToken(
  db: DbClient,
  token: string,
): Promise<void> {
  await db.delete(sessions).where(sessionTokenLookup(token));
}

export async function deleteSessionsByMemberId(
  db: DbClient,
  memberId: string,
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.memberId, memberId));
}

/**
 * Replace a member's password hash (FR-006, ADR 0018).
 *
 * Takes an already-hashed value: a plaintext password has no business reaching
 * the data layer, where it would end up in a query the driver can echo back in
 * an error message.
 *
 * Returns whether a row was actually updated, so the caller can tell a real
 * reset from a reset of a member that does not exist.
 */
export async function setMemberPasswordHash(
  db: DbClient,
  memberId: string,
  passwordHash: string,
): Promise<boolean> {
  const updated = await db
    .update(members)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(members.id, memberId))
    .returning({ id: members.id });

  return updated.length > 0;
}

/**
 * Claim an address, unverified (ADR 0032).
 *
 * Claiming always clears `emailVerifiedAt`, including when the member retypes
 * the address they already proved: the proof belongs to a click on a link, and
 * an update that kept it would let a member move a verified flag onto an
 * address they have never opened.
 *
 * The unique index is what refuses an address another member already holds.
 * The caller catches that violation rather than checking first — a check would
 * be a lookup, and a lookup that answers "taken" tells the asker who else is
 * in the club (ADR 0005).
 */
export async function setMemberEmail(
  db: DbClient,
  memberId: string,
  email: string,
): Promise<boolean> {
  const updated = await db
    .update(members)
    .set({ email, emailVerifiedAt: null, updatedAt: new Date() })
    .where(eq(members.id, memberId))
    .returning({ id: members.id });

  return updated.length > 0;
}

/**
 * Record that a link sent to `email` was opened.
 *
 * Guarded on the address, not just the member: a token issued for an address
 * the member has since replaced must not stamp the replacement as verified.
 */
export async function markEmailVerified(
  db: DbClient,
  memberId: string,
  email: string,
  now: Date,
): Promise<boolean> {
  const updated = await db
    .update(members)
    .set({ emailVerifiedAt: now, updatedAt: now })
    .where(and(eq(members.id, memberId), eq(members.email, email)))
    .returning({ id: members.id });

  return updated.length > 0;
}

/**
 * Issue a single-use link (ADR 0032).
 *
 * Takes the hash, never the token: the token exists in the email and in the
 * caller's local variable, and nowhere else. Any earlier token for the same
 * member and purpose is deleted first, so requesting a new link invalidates
 * the old one — otherwise every resend widens the window in which an
 * intercepted mail still works.
 */
export async function createVerificationToken(
  db: DbClient,
  input: {
    memberId: string;
    purpose: VerificationPurpose;
    email: string;
    tokenHash: string;
    expiresAt: Date;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(verificationTokens)
      .where(
        and(
          eq(verificationTokens.memberId, input.memberId),
          eq(verificationTokens.purpose, input.purpose),
        ),
      );

    await tx.insert(verificationTokens).values(input);
  });
}

/**
 * When the member's newest token of this purpose was issued, or `null` if they
 * hold none. The resend throttle reads this; it is not a credential check.
 */
export async function findLatestVerificationTokenIssuedAt(
  db: DbClient,
  memberId: string,
  purpose: VerificationPurpose,
): Promise<Date | null> {
  const row = await db.query.verificationTokens.findFirst({
    where: and(
      eq(verificationTokens.memberId, memberId),
      eq(verificationTokens.purpose, purpose),
    ),
    orderBy: desc(verificationTokens.createdAt),
    columns: { createdAt: true },
  });

  return row?.createdAt ?? null;
}

/**
 * Redeem a link, once.
 *
 * The read and the stamp are one statement on purpose. Selecting the row and
 * then updating it would let two clicks a millisecond apart both pass the
 * check and both act; `WHERE consumed_at IS NULL ... RETURNING` lets exactly
 * one of them come back with a row.
 *
 * Expiry is compared here rather than by the caller for the same reason it is
 * enforced in SQL elsewhere in this codebase: the database's clock is the one
 * both racing requests share.
 */
export async function consumeVerificationToken(
  db: DbClient,
  tokenHash: string,
  purpose: VerificationPurpose,
  now: Date,
): Promise<{ memberId: string; email: string } | null> {
  const consumed = await db
    .update(verificationTokens)
    .set({ consumedAt: now })
    .where(
      and(
        eq(verificationTokens.tokenHash, tokenHash),
        eq(verificationTokens.purpose, purpose),
        isNull(verificationTokens.consumedAt),
        gt(verificationTokens.expiresAt, now),
      ),
    )
    .returning({
      memberId: verificationTokens.memberId,
      email: verificationTokens.email,
    });

  return consumed[0] ?? null;
}

/**
 * The member behind an external account (ADR 0029).
 *
 * Matched on the provider's subject id, never on the address: an address can
 * change hands at a provider, and the subject id is what Google promises is
 * stable.
 */
export async function findMemberByProviderAccount(
  db: DbClient,
  provider: IdentityProvider,
  providerAccountId: string,
) {
  const link = await db.query.memberIdentities.findFirst({
    where: and(
      eq(memberIdentities.provider, provider),
      eq(memberIdentities.providerAccountId, providerAccountId),
    ),
    with: { member: true },
  });

  return link?.member ?? null;
}

/**
 * Link an external account to a member.
 *
 * Idempotent on the pair, so a member who signs in through Google twice in the
 * same second ends up with one row rather than a unique violation. A *different*
 * Google account for the same member, or the same Google account for a
 * different member, still violates — both of those are the indexes doing their
 * job, and the caller reports them as a refusal rather than swallowing them.
 */
export async function linkProviderAccount(
  db: DbClient,
  input: {
    memberId: string;
    provider: IdentityProvider;
    providerAccountId: string;
  },
): Promise<void> {
  await db
    .insert(memberIdentities)
    .values(input)
    .onConflictDoNothing({
      target: [memberIdentities.provider, memberIdentities.providerAccountId],
    });
}

/**
 * The member's own sessions, for the screen that lets them end one (FR-007).
 *
 * The token is deliberately not selected. This list exists to be rendered, and
 * a session token that reaches a template is a session token that can leak;
 * a session is ended by its id, which is not a credential.
 */
export async function listSessionsByMemberId(db: DbClient, memberId: string) {
  return db
    .select({
      id: sessions.id,
      userAgent: sessions.userAgent,
      ipAddress: sessions.ipAddress,
      lastSeenAt: sessions.lastSeenAt,
      createdAt: sessions.createdAt,
      isPartialSession: sessions.isPartialSession,
    })
    .from(sessions)
    .where(eq(sessions.memberId, memberId))
    .orderBy(desc(sessions.lastSeenAt));
}

export type MemberSessionView = Awaited<
  ReturnType<typeof listSessionsByMemberId>
>[number];

/**
 * End one session, but only if it belongs to this member.
 *
 * The member id is part of the WHERE clause rather than checked beforehand:
 * a guessed session id from another account then deletes nothing instead of
 * relying on a check somebody could later move or forget.
 */
export async function deleteSessionByIdForMember(
  db: DbClient,
  memberId: string,
  sessionId: string,
): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.memberId, memberId)))
    .returning({ id: sessions.id });

  return deleted.length;
}

/** End every session except the one making the request ("sign out everywhere else"). */
export async function deleteOtherSessionsForMember(
  db: DbClient,
  memberId: string,
  keepSessionId: string,
): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(and(eq(sessions.memberId, memberId), ne(sessions.id, keepSessionId)))
    .returning({ id: sessions.id });

  return deleted.length;
}

export async function upgradeSessionTx(
  db: DbClient,
  token: string,
  memberId: string,
  ipAddress: string,
  userAgent: string,
  /**
   * The already-encrypted seed to enrol, when this sign-in was an enrolment.
   * It comes from the session's own pending column, never from the request -
   * the caller must not be able to choose which secret a member ends up with.
   */
  encryptedSecretToEnrol?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    // The pending seed is cleared whether or not it was enrolled, so an
    // abandoned enrolment does not leave a seed sitting on a live session.
    await tx
      .update(sessions)
      .set({ isPartialSession: false, pendingTotpSecret: null })
      .where(sessionTokenLookup(token));

    if (encryptedSecretToEnrol) {
      await tx
        .update(members)
        .set({ totpEnabled: true, totpSecret: encryptedSecretToEnrol })
        .where(eq(members.id, memberId));
    }

    await appendAuditEntry(tx, {
      actorType: "member",
      actorId: memberId,
      action: "member.totp_verified",
      subjectType: "member",
      subjectId: memberId,
      ip: ipAddress,
      userAgent,
    });
  });
}
