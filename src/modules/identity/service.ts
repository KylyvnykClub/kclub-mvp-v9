import { db } from "@/data/db";
import {
  createSessionTx,
  deleteSessionByToken,
  findActiveSessionByToken,
  findMemberByPhone,
  registerMemberTx,
} from "@/data/identity";
import { generateToken, hashPassword, verifyPassword } from "./crypto";
import { generateTotpSecret, verifyTotpCode } from "./totp";
import { checkVerificationCode, sendVerificationCode } from "./twilio";
import { upgradeSessionTx } from "@/data/identity";
import { logger } from "@/lib/logger";
import { env } from "@/env";
import { isStaffRole, normalizeRole } from "@/domain/actor";

function isPhoneUniquenessError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "constraint" in error &&
    error.code === "23505" &&
    error.constraint === "members_phone_unique"
  );
}

export class IdentityService {
  /**
   * Step 1 of registration: send the SMS code. The member row is only
   * created after the code is verified (FR-004), so no junk records.
   */
  static async requestPhoneVerification(phone: string): Promise<boolean> {
    if (!env.server.AUTH_PHONE_VERIFICATION_ENABLED) {
      // Nothing to send while SMS is postponed. Reported as "not sent" rather
      // than as an error, so the caller can move straight to the form.
      return false;
    }

    const existing = await findMemberByPhone(db, phone);

    if (existing) {
      // Don't leak whether the phone is registered; the caller decides.
      return false;
    }

    return await sendVerificationCode(phone);
  }

  /**
   * Step 2 of registration: complete registration after SMS code is verified.
   */
  static async registerMember(params: {
    phone: string;
    code?: string;
    passwordPlain: string;
    displayName: string;
    country: string;
    language: string;
    userAgent: string;
    ipAddress: string;
    consents: Array<{ documentId: string; version: string }>;
  }): Promise<{ success: boolean; sessionToken?: string; error?: string }> {
    // ADR 0012: while phone verification is postponed the SMS code is not
    // requested, not sent and not checked. The flag is the single place that
    // decides, so turning Twilio back on is one environment variable.
    if (env.server.AUTH_PHONE_VERIFICATION_ENABLED) {
      const isCodeValid = await checkVerificationCode(
        params.phone,
        params.code ?? "",
      );
      if (!isCodeValid) {
        return {
          success: false,
          error: "Invalid or expired verification code",
        };
      }
    }

    const passwordHash = await hashPassword(params.passwordPlain);

    try {
      const sessionToken = generateToken();

      // FR-020: membership card is issued automatically with registration.
      const serial = `KCLUB-${Math.floor(100000 + Math.random() * 900000)}`;

      await registerMemberTx(db, {
        phone: params.phone,
        passwordHash,
        displayName: params.displayName,
        country: params.country,
        language: params.language,
        userAgent: params.userAgent,
        ipAddress: params.ipAddress,
        consents: params.consents,
        cardSerial: serial,
        sessionToken,
      });

      return { success: true, sessionToken };
    } catch (error) {
      logger.error("Failed to create member account", {
        error: error instanceof Error ? error.message : String(error),
      });

      if (isPhoneUniquenessError(error)) {
        return {
          success: false,
          error: "Phone is already registered.",
        };
      }

      return {
        success: false,
        error: "Failed to create account. Please try again.",
      };
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
  }): Promise<{
    success: boolean;
    sessionToken?: string;
    requiresTotp?: boolean;
    setupTotp?: boolean;
    totpUri?: string;
    totpSecret?: string;
    error?: string;
  }> {
    const member = await findMemberByPhone(db, params.phone);

    if (!member) {
      return { success: false, error: "Invalid credentials" };
    }

    if (member.status === "blocked" || member.status === "pending_deletion") {
      return { success: false, error: "Account is not active" };
    }

    const isValid = await verifyPassword(
      member.passwordHash,
      params.passwordPlain,
    );
    if (!isValid) {
      return { success: false, error: "Invalid credentials" };
    }

    const isStaff = isStaffRole(normalizeRole(member.role));
    const requiresTotp = isStaff;

    const sessionToken = generateToken();
    await createSessionTx(db, {
      memberId: member.id,
      sessionToken,
      userAgent: params.userAgent,
      ipAddress: params.ipAddress,
      isPartialSession: requiresTotp,
    });

    if (requiresTotp) {
      if (member.totpEnabled) {
        return { success: true, sessionToken, requiresTotp: true };
      } else {
        const { secret, uri } = generateTotpSecret();
        return {
          success: true,
          sessionToken,
          requiresTotp: true,
          setupTotp: true,
          totpSecret: secret,
          totpUri: uri,
        };
      }
    }

    return { success: true, sessionToken };
  }

  /**
   * Verify TOTP code for a partial session.
   */
  static async verifyTotp(params: {
    sessionToken: string;
    code: string;
    ipAddress: string;
    userAgent: string;
    newSecret?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const session = await findActiveSessionByToken(db, params.sessionToken);
    if (!session || !session.member || !session.isPartialSession) {
      return { success: false, error: "Invalid session" };
    }

    const secret = params.newSecret ?? session.member.totpSecret;
    if (!secret) {
      return { success: false, error: "TOTP not configured" };
    }

    const isValid = verifyTotpCode(secret, params.code);
    if (!isValid) {
      return { success: false, error: "Invalid code" };
    }

    await upgradeSessionTx(
      db,
      params.sessionToken,
      session.memberId,
      params.ipAddress,
      params.userAgent,
      params.newSecret,
    );

    return { success: true };
  }

  /**
   * Gets a member from a session token. Used by middleware.
   */
  static async authenticateSession(token: string) {
    const session = await findActiveSessionByToken(db, token);

    if (!session || session.isPartialSession) {
      return null;
    }

    return { session, member: session.member };
  }

  /**
   * Log out current session.
   */
  static async logout(token: string) {
    await deleteSessionByToken(db, token);
  }
}
