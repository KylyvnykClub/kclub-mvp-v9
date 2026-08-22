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
import {
  decryptTotpSecret,
  encryptTotpSecret,
  requireTotpEncryptionKey,
} from "./totp-crypto";
import { checkVerificationCode, sendVerificationCode } from "./twilio";
import { upgradeSessionTx } from "@/data/identity";
import { logger } from "@/lib/logger";
import { isUniqueViolation, safeErrorFields } from "@/lib/safe-error";
import { env } from "@/env";
import { isStaffRole, normalizeRole } from "@/domain/actor";

function isPhoneUniquenessError(error: unknown) {
  return isUniqueViolation(error, "members_phone_unique");
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
      // Not error.message: drizzle puts the statement and its bound values
      // there, which for this statement are the phone number and the password
      // hash (security.md §3).
      logger.error("Failed to create member account", safeErrorFields(error));

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
    /**
     * The otpauth:// URI for the enrolment QR. It necessarily embeds the seed,
     * which is why it is returned only during enrolment and never stored.
     */
    totpUri?: string;
    /** FR-091: the saved preference, so the caller can make it the locale. */
    language?: string;
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

    // A staff member with no authenticator yet is enrolling. The seed is
    // generated here so it can be written, encrypted, in the same statement
    // that creates the partial session - rather than being handed to the
    // browser and accepted back on the verify request, which let the client
    // choose which secret it would be judged against.
    const enrolment =
      requiresTotp && !member.totpEnabled ? generateTotpSecret() : null;

    let pendingTotpSecret: string | undefined;
    if (enrolment) {
      try {
        pendingTotpSecret = encryptTotpSecret(
          enrolment.secret,
          member.id,
          requireTotpEncryptionKey(),
        );
      } catch {
        logger.error(
          "TOTP_ENCRYPTION_KEY is not configured; refusing to enrol a staff authenticator",
        );
        return {
          success: false,
          error: "Two-factor authentication is unavailable",
        };
      }
    }

    const sessionToken = generateToken();
    await createSessionTx(db, {
      memberId: member.id,
      sessionToken,
      userAgent: params.userAgent,
      ipAddress: params.ipAddress,
      isPartialSession: requiresTotp,
      ...(pendingTotpSecret ? { pendingTotpSecret } : {}),
    });

    if (requiresTotp) {
      if (enrolment) {
        return {
          success: true,
          sessionToken,
          requiresTotp: true,
          setupTotp: true,
          totpUri: enrolment.uri,
          language: member.language,
        };
      }

      return {
        success: true,
        sessionToken,
        requiresTotp: true,
        language: member.language,
      };
    }

    return { success: true, sessionToken, language: member.language };
  }

  /**
   * Verify TOTP code for a partial session.
   */
  static async verifyTotp(params: {
    sessionToken: string;
    code: string;
    ipAddress: string;
    userAgent: string;
  }): Promise<{ success: boolean; error?: string }> {
    const session = await findActiveSessionByToken(db, params.sessionToken);
    if (!session || !session.member || !session.isPartialSession) {
      return { success: false, error: "Invalid session" };
    }

    let key: string;
    try {
      key = requireTotpEncryptionKey();
    } catch {
      logger.error(
        "TOTP_ENCRYPTION_KEY is not configured; refusing to verify a staff authenticator",
      );
      return {
        success: false,
        error: "Two-factor authentication is unavailable",
      };
    }

    // Which seed to judge against is decided here, from server state alone.
    // An enrolment is identified by the session carrying a pending seed, not
    // by anything the request said about itself.
    const pending = session.pendingTotpSecret;
    const secret = decryptTotpSecret(
      pending ?? session.member.totpSecret,
      session.memberId,
      key,
    );

    // Null covers an absent seed, one bound to a different member, and one this
    // key cannot open - including every plaintext value left by the old code.
    // All of them mean "no usable second factor", and all of them must refuse
    // the sign-in rather than skip the check.
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
      pending ?? undefined,
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
