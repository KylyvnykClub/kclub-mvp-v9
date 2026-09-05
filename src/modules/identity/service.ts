import { appendAuditEntry } from "@/data/audit-log";
import { createPasswordResetRequest } from "@/data/password-reset-requests";
import { db } from "@/data/db";
import {
  consumeVerificationToken,
  createSessionTx,
  createVerificationToken,
  deleteSessionByToken,
  deleteSessionsByMemberId,
  findActiveSessionByToken,
  findLatestVerificationTokenIssuedAt,
  findMemberByEmail,
  findMemberById,
  findMemberByPhone,
  markEmailVerified,
  registerMemberTx,
  setMemberEmail,
  setMemberPasswordHash,
} from "@/data/identity";
import {
  sendEmailVerificationEmail,
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
} from "@/modules/notifications/email";
import { absoluteUrl } from "@/lib/seo";
import { narrowLocale } from "@/lib/locale";
import { hashVerificationToken } from "@/lib/verification-token";
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
import { refuseSignIn, type SignInErrorCode } from "@/domain/sign-in";
import { routeRecovery } from "@/domain/recovery";
import type { RegisterErrorCode } from "@/domain/registration";
import type { LoginIdentifier } from "@/lib/login-identifier";

function isPhoneUniquenessError(error: unknown) {
  return isUniqueViolation(error, "members_phone_unique");
}

/**
 * How long the member has to open the link (ADR 0032). Long enough to survive
 * a mail client that batches, short enough that a link left in an inbox is not
 * a standing key to the account.
 */
export const EMAIL_VERIFICATION_TTL_HOURS = 24;

/** Shortest gap between two links sent to the same address. */
export const EMAIL_RESEND_INTERVAL_MS = 60_000;

/**
 * Much shorter than the verification link, because this one changes a
 * credential rather than confirming a claim: 30 minutes is long enough for a
 * member reading their mail and short enough that a message left in an open
 * inbox stops being a way in.
 */
export const PASSWORD_RESET_TTL_MINUTES = 30;

export type ClaimEmailResult =
  | { ok: true }
  /**
   * `unavailable` — the address belongs to someone else, or to nobody we can
   * act for. Deliberately one reason, not two.
   * `throttled` — a link went out less than a minute ago.
   * `undeliverable` — claimed, but the mail did not leave.
   */
  | { ok: false; reason: "unavailable" | "throttled" | "undeliverable" };

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
   * Whether a number already belongs to a member (ADR 0030).
   *
   * Its own method rather than a flag threaded through
   * `requestPhoneVerification`, because the two answer different questions and
   * only this one discloses anything: the caller is telling the member "you
   * already have an account", and the caller is the one that has to be rate
   * limited for saying so.
   */
  static async isPhoneRegistered(phone: string): Promise<boolean> {
    return Boolean(await findMemberByPhone(db, phone));
  }

  /**
   * Step 2 of registration: complete registration after SMS code is verified.
   */
  static async registerMember(params: {
    phone: string;
    /**
     * Required (ADR 0032). Both identifiers are collected here; only the
     * number works until the link below is opened.
     */
    email: string;
    /**
     * A provider that has already proved this exact address in this request
     * (ADR 0029). Its presence is what lets registration mark the address
     * verified without sending a link; the caller checks that the address it
     * vouched for is the address being registered.
     */
    provenBy?: { provider: "google"; providerAccountId: string };
    code?: string;
    passwordPlain: string;
    displayName: string;
    country: string;
    language: string;
    userAgent: string;
    ipAddress: string;
    consents: Array<{ documentId: string; version: string }>;
  }): Promise<{
    success: boolean;
    sessionToken?: string;
    error?: RegisterErrorCode;
  }> {
    // ADR 0012: while phone verification is postponed the SMS code is not
    // requested, not sent and not checked. The flag is the single place that
    // decides, so turning Twilio back on is one environment variable.
    if (env.server.AUTH_PHONE_VERIFICATION_ENABLED) {
      const isCodeValid = await checkVerificationCode(
        params.phone,
        params.code ?? "",
      );
      if (!isCodeValid) {
        return { success: false, error: "code_invalid" };
      }
    }

    const passwordHash = await hashPassword(params.passwordPlain);

    try {
      const sessionToken = generateToken();

      // FR-020: membership card is issued automatically with registration.
      const serial = `KCLUB-${Math.floor(100000 + Math.random() * 900000)}`;

      const now = new Date();

      const memberId = await registerMemberTx(db, {
        phone: params.phone,
        email: params.email,
        emailVerifiedAt: params.provenBy ? now : null,
        identity: params.provenBy
          ? {
              provider: params.provenBy.provider,
              providerAccountId: params.provenBy.providerAccountId,
            }
          : undefined,
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

      // Nothing to prove where a provider already did it (ADR 0029). For
      // everyone else the link goes out here and is not waited on: the account
      // exists, the member is signed in, and a message that fails to leave is
      // a logged failure rather than a lost registration (ADR 0032).
      if (!params.provenBy) {
        await IdentityService.issueEmailVerification({
          memberId,
          email: params.email,
          displayName: params.displayName,
          locale: narrowLocale(params.language),
        }).catch((error: unknown) => {
          logger.error("welcome verification email failed", {
            ...safeErrorFields(error),
          });
        });
      }

      return { success: true, sessionToken };
    } catch (error) {
      // Not error.message: drizzle puts the statement and its bound values
      // there, which for this statement are the phone number and the password
      // hash (security.md §3).
      logger.error("Failed to create member account", safeErrorFields(error));

      if (isPhoneUniquenessError(error)) {
        return { success: false, error: "phone_taken" };
      }

      // Deliberately vaguer than the phone answer above: confirming that an
      // address is registered tells an anonymous caller who is in the club
      // (ADR 0005), and ADR 0030's disclosure covers the number only. The
      // screen renders this one against the address field, so the applicant
      // knows which of the two to change without being told who holds it.
      if (isUniqueViolation(error, "members_email_unique")) {
        return { success: false, error: "email_taken" };
      }

      return { success: false, error: "failed" };
    }
  }

  /**
   * Log in an existing member.
   */
  static async login(params: {
    identifier: LoginIdentifier;
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
    error?: SignInErrorCode;
  }> {
    const member =
      params.identifier.kind === "phone"
        ? await findMemberByPhone(db, params.identifier.value)
        : await findMemberByEmail(db, params.identifier.value);

    if (!member) {
      return { success: false, error: "invalid_credentials" };
    }

    // Blocked accounts, and addresses nobody has proved (ADR 0032). The rule
    // itself is in `src/domain/sign-in.ts`, where it can be tested without a
    // database.
    const refusal = refuseSignIn(params.identifier.kind, member);

    if (refusal) {
      return { success: false, error: refusal };
    }

    const isValid = await verifyPassword(
      member.passwordHash,
      params.passwordPlain,
    );
    if (!isValid) {
      return { success: false, error: "invalid_credentials" };
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
        return { success: false, error: "totp_unavailable" };
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
  }): Promise<{ success: boolean; error?: SignInErrorCode }> {
    const session = await findActiveSessionByToken(db, params.sessionToken);
    if (!session || !session.member || !session.isPartialSession) {
      return { success: false, error: "session_expired" };
    }

    let key: string;
    try {
      key = requireTotpEncryptionKey();
    } catch {
      logger.error(
        "TOTP_ENCRYPTION_KEY is not configured; refusing to verify a staff authenticator",
      );
      return { success: false, error: "totp_unavailable" };
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
      return { success: false, error: "totp_not_configured" };
    }

    const isValid = verifyTotpCode(secret, params.code);
    if (!isValid) {
      return { success: false, error: "invalid_code" };
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

  /**
   * Claim an email address and send the link that proves it (ADR 0032).
   *
   * The address is written before the mail goes out, so the token has
   * something to point at and a member who never opens the link is left
   * holding an unverified claim — which signs nobody in and resets nothing.
   *
   * Every outcome that is not "sent" is deliberately coarse. "Unavailable"
   * covers an address another member already holds, and it says nothing about
   * who: an authenticated member asking whether an address is in the club is
   * still asking who is in the club (ADR 0005).
   */
  static async claimEmail(params: {
    memberId: string;
    /** What the account holds now, so a resend can be told from a change. */
    currentEmail: string | null;
    email: string;
    displayName: string;
    locale: "en" | "ru" | "uk";
    now?: Date;
  }): Promise<ClaimEmailResult> {
    const now = params.now ?? new Date();

    // Asking again for the address already on the account is a resend, and
    // resends are what an attacker with a stolen session would use to bury a
    // mailbox. Changing the address is not throttled: a member correcting a
    // typo should not be made to wait for the mistake.
    if (params.currentEmail === params.email) {
      const lastIssuedAt = await findLatestVerificationTokenIssuedAt(
        db,
        params.memberId,
        "email_verify",
      );

      if (
        lastIssuedAt &&
        now.getTime() - lastIssuedAt.getTime() < EMAIL_RESEND_INTERVAL_MS
      ) {
        return { ok: false, reason: "throttled" };
      }
    }

    // Only a *change* of address is written. `setMemberEmail` clears
    // `email_verified_at` by design — a new address is unproved — but running
    // it for a resend would un-verify an address the member had already
    // proved, and a message that then failed to arrive would leave them
    // unable to sign in by address or to reset their own password. A resend
    // issues a fresh token against the address that is already there.
    if (params.currentEmail !== params.email) {
      try {
        await setMemberEmail(db, params.memberId, params.email);
      } catch (error) {
        if (isUniqueViolation(error, "members_email_unique")) {
          return { ok: false, reason: "unavailable" };
        }
        throw error;
      }
    }

    const sent = await IdentityService.issueEmailVerification({
      memberId: params.memberId,
      email: params.email,
      displayName: params.displayName,
      locale: params.locale,
      now,
    });

    return sent ? { ok: true } : { ok: false, reason: "undeliverable" };
  }

  /**
   * Mint a link for an address the member already holds, and send it.
   *
   * Shared by the settings panel and by registration, so both produce the same
   * token with the same lifetime — a second implementation of this is how one
   * of the two ends up with a link that never expires.
   *
   * Returns whether the message left. The address is stored either way; only
   * the proof failed, and the member can ask for another.
   */
  static async issueEmailVerification(params: {
    memberId: string;
    email: string;
    displayName: string;
    locale: "en" | "ru" | "uk";
    now?: Date;
  }): Promise<boolean> {
    const now = params.now ?? new Date();
    const token = generateToken();

    await createVerificationToken(db, {
      memberId: params.memberId,
      purpose: "email_verify",
      email: params.email,
      tokenHash: hashVerificationToken(token),
      expiresAt: new Date(
        now.getTime() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000,
      ),
    });

    try {
      return await sendEmailVerificationEmail({
        to: params.email,
        displayName: params.displayName,
        locale: params.locale,
        url: absoluteUrl(
          `/${params.locale}/verify-email?token=${encodeURIComponent(token)}`,
        ),
        expiresInHours: EMAIL_VERIFICATION_TTL_HOURS,
      });
    } catch (error) {
      // Told plainly rather than swallowed: on the settings screen a member is
      // waiting for a message that is never going to arrive.
      logger.error("email verification could not be sent", {
        memberId: params.memberId,
        ...safeErrorFields(error),
      });
      return false;
    }
  }

  /**
   * Start a password reset (FR-006, ADR 0032).
   *
   * Two outcomes, one entry point. Where the account holds an address it has
   * proved, a single-use link goes to that address and nothing reaches staff.
   * Where it does not — the nine accounts that predate ADR 0032, or anyone who
   * never opened their link — a row lands on the staff console instead and an
   * owner performs the reset the way ADR 0018 describes.
   *
   * Which of the two ran is never returned. The caller says one sentence to
   * everyone, because this is a form an anonymous visitor can submit
   * identifiers to freely and it must not become a membership oracle
   * (security.md §6). Registration's first step is the single stated exception
   * (ADR 0030), gated separately.
   *
   * The mail is addressed from the member row, never from what the caller
   * typed: a request naming a phone number sends to the address on that
   * account, so this form cannot be aimed at a mailbox of the caller's
   * choosing.
   */
  static async requestPasswordReset(params: {
    identifier: LoginIdentifier;
    now?: Date;
  }): Promise<void> {
    const now = params.now ?? new Date();

    const member =
      params.identifier.kind === "phone"
        ? await findMemberByPhone(db, params.identifier.value)
        : await findMemberByEmail(db, params.identifier.value);

    const route = routeRecovery(member ?? null);

    if (route === "none" || !member) return;

    if (route === "staff") {
      await createPasswordResetRequest(db, {
        memberId: member.id,
        phone: member.phone,
      });
      return;
    }

    const address = member.email;

    // Unreachable: "email" is returned only for an address that is present and
    // proved. Written as a guard rather than an assertion so the compiler
    // establishes it instead of being told.
    if (!address) return;

    const token = generateToken();

    await createVerificationToken(db, {
      memberId: member.id,
      purpose: "password_reset",
      email: address,
      tokenHash: hashVerificationToken(token),
      expiresAt: new Date(
        now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
      ),
    });

    const locale = narrowLocale(member.language);

    try {
      await sendPasswordResetEmail({
        to: address,
        displayName: member.displayName,
        locale,
        url: absoluteUrl(
          `/${locale}/reset-password/${encodeURIComponent(token)}`,
        ),
        expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
      });
    } catch (error) {
      // Logged, not surfaced: the screen says the same thing either way, and
      // the member can ask again.
      logger.error("password reset email could not be sent", {
        memberId: member.id,
        ...safeErrorFields(error),
      });
    }
  }

  /**
   * Set a new password against a reset link (FR-006).
   *
   * The half that is easy to leave out is the second one: **every session
   * ends**. If somebody else is in the account, changing the password while
   * their session lives achieves nothing.
   */
  static async resetPassword(params: {
    token: string;
    passwordPlain: string;
    now?: Date;
  }): Promise<boolean> {
    const now = params.now ?? new Date();

    const consumed = await consumeVerificationToken(
      db,
      hashVerificationToken(params.token),
      "password_reset",
      now,
    );

    if (!consumed) return false;

    // Hashed after the token is spent, not before: argon2 takes real time, and
    // a caller who could hold the token unspent while it ran would have a
    // window to use it twice.
    const passwordHash = await hashPassword(params.passwordPlain);
    const changed = await setMemberPasswordHash(
      db,
      consumed.memberId,
      passwordHash,
    );

    if (!changed) return false;

    await deleteSessionsByMemberId(db, consumed.memberId);

    await appendAuditEntry(db, {
      actorType: "member",
      actorId: consumed.memberId,
      action: "member.password_reset",
      subjectType: "member",
      subjectId: consumed.memberId,
      meta: { sessionsRevoked: true, provenBy: "email" },
    });

    // By id, not by `consumed.email`. The token carries the address it was
    // minted for, and the account can have moved to another one inside the
    // 30 minutes since — in which case looking the address up finds nobody
    // and this notice is silently dropped, or finds whoever has claimed the
    // freed address since and tells *them* that their password changed.
    // security.md §1 requires this message; it must not depend on the address
    // having stayed put.
    const member = await findMemberById(db, consumed.memberId);

    if (member?.email) {
      // Told after the fact (security.md §1): if the reset was not theirs,
      // this is the message that says so.
      await sendPasswordChangedEmail({
        to: member.email,
        displayName: member.displayName,
        locale: narrowLocale(member.language),
      }).catch((error: unknown) => {
        logger.error("password change notice could not be sent", {
          memberId: consumed.memberId,
          ...safeErrorFields(error),
        });
      });
    }

    return true;
  }

  /**
   * Redeem the link (ADR 0032).
   *
   * Both halves are guarded on the address the token was issued for, not on
   * the member alone: a member who claims one address, changes their mind and
   * claims another must not be able to verify the second with the first one's
   * link.
   */
  static async confirmEmail(
    token: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    const consumed = await consumeVerificationToken(
      db,
      hashVerificationToken(token),
      "email_verify",
      now,
    );

    if (!consumed) {
      return false;
    }

    const verified = await markEmailVerified(
      db,
      consumed.memberId,
      consumed.email,
      now,
    );

    if (!verified) {
      return false;
    }

    await appendAuditEntry(db, {
      actorType: "member",
      actorId: consumed.memberId,
      action: "member.email_verified",
      subjectType: "member",
      subjectId: consumed.memberId,
    });

    return true;
  }
}
