"use server";

import { cookies, headers } from "next/headers";
import { IdentityService } from "@/modules/identity";
import { z } from "zod";
import { getLegalDocument } from "@/lib/mdx";
import {
  AGE_ATTESTATION_VERSION,
  CONSENT_DOCUMENT_IDS,
  consentSourceDocument,
  type ConsentAcceptance,
} from "@/lib/legal-consents";

const requestPhoneSchema = z.object({
  phone: z.string().min(8).max(20),
});

export async function requestPhoneVerificationAction(formData: FormData) {
  try {
    const data = requestPhoneSchema.parse(Object.fromEntries(formData));
    const sent = await IdentityService.requestPhoneVerification(data.phone);
    return { success: true, sent }; // Always return true so we don't leak registered phones
  } catch (err) {
    if (err instanceof z.ZodError)
      return { success: false, error: err.issues[0]?.message };
    return { success: false, error: "Failed to send verification code" };
  }
}

const consentAcceptanceSchema = z.object({
  documentId: z.enum(CONSENT_DOCUMENT_IDS),
  version: z.string().min(1).max(50),
});

const registerSchema = z.object({
  phone: z.string().min(8).max(20),
  code: z.string().min(6).max(6),
  password: z.string().min(8).max(100),
  displayName: z.string().min(2).max(255),
  country: z.string().length(2),
  language: z.string().length(2),
  consents: z.array(consentAcceptanceSchema),
});

/**
 * Every submitted acknowledgement must reference the version currently
 * published for that document (FR-093, FR-097). A stale or fabricated
 * version fails registration; the recorded version is always the one the
 * member saw at submit time.
 */
async function consentVersionsMatch(
  consents: ConsentAcceptance[],
): Promise<boolean> {
  for (const consent of consents) {
    const sourceDocument = consentSourceDocument(consent.documentId);
    if (consent.documentId === "age-verification") {
      if (consent.version !== AGE_ATTESTATION_VERSION) {
        return false;
      }
      continue;
    }
    const published = await getLegalDocument(sourceDocument, "en");
    if (!published || published.version !== consent.version) {
      return false;
    }
  }
  return true;
}

export async function registerAction(formData: FormData) {
  try {
    const headerList = await headers();
    const userAgent = headerList.get("user-agent") || "unknown";
    const ipAddress =
      headerList.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

    const raw = Object.fromEntries(formData);
    const consentsField = formData.get("consents");
    const rawConsents: unknown =
      typeof consentsField === "string" ? JSON.parse(consentsField) : [];
    const data = registerSchema.parse({ ...raw, consents: rawConsents });

    const requiredIds = new Set(CONSENT_DOCUMENT_IDS);
    const submittedIds = new Set(data.consents.map((c) => c.documentId));
    const allAccepted =
      submittedIds.size === requiredIds.size &&
      [...requiredIds].every((id) => submittedIds.has(id));

    if (!allAccepted) {
      return { success: false, error: "All acknowledgements are required" };
    }

    if (!(await consentVersionsMatch(data.consents))) {
      return {
        success: false,
        error: "Legal documents have been updated. Please review them again.",
      };
    }

    const result = await IdentityService.registerMember({
      phone: data.phone,
      code: data.code,
      passwordPlain: data.password,
      displayName: data.displayName,
      country: data.country,
      language: data.language,
      userAgent,
      ipAddress,
      consents: data.consents,
    });

    if (result.success && result.sessionToken) {
      const cookieStore = await cookies();
      cookieStore.set("session", result.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
      return { success: true };
    } else {
      return { success: false, error: result.error };
    }
  } catch (err) {
    if (err instanceof z.ZodError)
      return { success: false, error: err.issues[0]?.message };
    return { success: false, error: "Registration failed" };
  }
}

const loginSchema = z.object({
  phone: z.string().min(8).max(20),
  password: z.string().min(1),
});

export async function loginAction(formData: FormData) {
  try {
    const headerList = await headers();
    const userAgent = headerList.get("user-agent") || "unknown";
    const ipAddress =
      headerList.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

    const data = loginSchema.parse(Object.fromEntries(formData));

    const result = await IdentityService.login({
      phone: data.phone,
      passwordPlain: data.password,
      userAgent,
      ipAddress,
    });

    if (result.success && result.sessionToken && result.requiresTotp) {
      const cookieStore = await cookies();
      cookieStore.set("session", result.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 15, // 15 minutes for partial session
      });
      return {
        success: true,
        requiresTotp: true,
        setupTotp: result.setupTotp,
        totpUri: result.totpUri,
        totpSecret: result.totpSecret,
      };
    } else if (result.success && result.sessionToken) {
      const cookieStore = await cookies();
      cookieStore.set("session", result.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
      return { success: true };
    } else {
      return { success: false, error: result.error };
    }
  } catch {
    return { success: false, error: "Login failed" };
  }
}

const verifyTotpSchema = z.object({
  code: z.string().min(6).max(6),
  newSecret: z.string().optional(),
});

export async function verifyTotpAction(formData: FormData) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return { success: false, error: "Session expired" };
    }

    const headerList = await headers();
    const userAgent = headerList.get("user-agent") || "unknown";
    const ipAddress =
      headerList.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

    const data = verifyTotpSchema.parse(Object.fromEntries(formData));

    const result = await IdentityService.verifyTotp({
      sessionToken: token,
      code: data.code,
      newSecret: data.newSecret,
      userAgent,
      ipAddress,
    });

    if (result.success) {
      // Upgrade the cookie duration to full 30 days
      cookieStore.set("session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
      return { success: true };
    }

    return { success: false, error: result.error };
  } catch {
    return { success: false, error: "Verification failed" };
  }
}

export async function logoutAction() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (token) {
    await IdentityService.logout(token);
    cookieStore.delete("session");
  }
  return { success: true };
}
