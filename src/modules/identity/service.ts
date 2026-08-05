import { db } from "@/data/db";
import { members, sessions, legalAcceptances, cards } from "@/data/schema";
import { eq, and, sql } from "drizzle-orm";
import { hashPassword, verifyPassword, generateToken } from "./crypto";
import { sendVerificationCode, checkVerificationCode } from "./twilio";
import { appendAuditEntry } from "@/data/audit-log";

export class IdentityService {
  /**
   * Step 1 of registration: Member submits phone and details.
   * We don't save the user yet (FR-004), or we save them as 'blocked' or we just
   * send the SMS and only create the user when the code is verified.
   * Actually, it's better to verify the code BEFORE creating the member to avoid
   * junk records.
   */
  static async requestPhoneVerification(phone: string): Promise<boolean> {
    // Check if phone already exists
    const existing = await db.query.members.findFirst({
      where: eq(members.phone, phone),
    });
    
    if (existing) {
      // Don't leak whether phone is registered in the UI directly, but we can't send a registration code.
      // Wait, Twilio Verify can send a code anyway, but we'll reject it on verify.
      // Or we can just pretend it sent.
      return false; // Let the caller decide how to handle
    }

    return await sendVerificationCode(phone);
  }

  /**
   * Step 2 of registration: Complete registration after SMS code is verified.
   */
  static async registerMember(params: {
    phone: string;
    code: string;
    passwordPlain: string;
    displayName: string;
    country: string;
    language: string;
    userAgent: string;
    ipAddress: string;
    consents: Array<{ documentId: string; version: string }>;
  }): Promise<{ success: boolean; sessionToken?: string; error?: string }> {
    // 1. Verify code
    const isCodeValid = await checkVerificationCode(params.phone, params.code);
    if (!isCodeValid) {
      return { success: false, error: "Invalid or expired verification code" };
    }

    // 2. Hash password
    const passwordHash = await hashPassword(params.passwordPlain);

    // 3. Perform transaction to insert member, card, consents, and initial session
    try {
      const sessionToken = generateToken();

      await db.transaction(async (tx) => {
        // Insert member
        const [member] = await tx
          .insert(members)
          .values({
            phone: params.phone,
            passwordHash,
            displayName: params.displayName,
            country: params.country,
            language: params.language,
          })
          .returning();

        // Insert legal acceptances
        if (params.consents.length > 0) {
          await tx.insert(legalAcceptances).values(
            params.consents.map((c) => ({
              memberId: member.id,
              documentId: c.documentId,
              version: c.version,
            }))
          );
        }

        // FR-020: Issue membership card automatically
        // Serial is human readable, e.g., KCLUB-XXXXXX
        const serial = `KCLUB-${Math.floor(100000 + Math.random() * 900000)}`;
        const cardToken = generateToken(16); // 32 chars hex

        await tx.insert(cards).values({
          memberId: member.id,
          serial,
          token: cardToken,
          tier: "free",
        });

        // Insert initial session
        await tx.insert(sessions).values({
          memberId: member.id,
          token: sessionToken,
          userAgent: params.userAgent,
          ipAddress: params.ipAddress,
        });

        // Audit log
        await appendAuditEntry(tx, {
          actorType: "member",
          actorId: member.id,
          action: "member.registered",
          subjectType: "member",
          subjectId: member.id,
          ip: params.ipAddress,
          userAgent: params.userAgent,
        });
      });

      return { success: true, sessionToken };
    } catch (error) {
      return { success: false, error: "Failed to create account. Phone might be registered already." };
    }
  }

  /**
   * Log in an existing member.
   */
  static async login(params: {
    phone: string;
    passwordPlain: string;
    userAgent: string;
    ipAddress: string;
  }): Promise<{ success: boolean; sessionToken?: string; error?: string }> {
    const member = await db.query.members.findFirst({
      where: eq(members.phone, params.phone),
    });

    if (!member) {
      return { success: false, error: "Invalid credentials" };
    }

    if (member.status === "blocked" || member.status === "pending_deletion") {
      return { success: false, error: "Account is not active" };
    }

    const isValid = await verifyPassword(member.passwordHash, params.passwordPlain);
    if (!isValid) {
      // Audit failed attempt?
      return { success: false, error: "Invalid credentials" };
    }

    // Create session
    const sessionToken = generateToken();
    await db.transaction(async (tx) => {
      await tx.insert(sessions).values({
        memberId: member.id,
        token: sessionToken,
        userAgent: params.userAgent,
        ipAddress: params.ipAddress,
      });

      await appendAuditEntry(tx, {
        actorType: "member",
        actorId: member.id,
        action: "member.logged_in",
        subjectType: "member",
        subjectId: member.id,
        ip: params.ipAddress,
        userAgent: params.userAgent,
      });
    });

    return { success: true, sessionToken };
  }

  /**
   * Gets a member from a session token. Used by middleware.
   */
  static async authenticateSession(token: string) {
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.token, token),
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

    // Optionally update lastSeenAt
    // await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, session.id));

    return { session, member: session.member };
  }

  /**
   * Log out current session.
   */
  static async logout(token: string) {
    await db.delete(sessions).where(eq(sessions.token, token));
  }
}
