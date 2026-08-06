"use server";

import { cookies, headers } from "next/headers";
import { IdentityService } from "@/modules/identity";
import { z } from "zod";

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

const registerSchema = z.object({
  phone: z.string().min(8).max(20),
  code: z.string().min(6).max(6),
  password: z.string().min(8).max(100),
  displayName: z.string().min(2).max(255),
  country: z.string().length(2),
  language: z.string().length(2),
  // In a real implementation we would parse consents JSON here
});

export async function registerAction(formData: FormData) {
  try {
    const headerList = await headers();
    const userAgent = headerList.get("user-agent") || "unknown";
    const ipAddress =
      headerList.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

    const data = registerSchema.parse(Object.fromEntries(formData));

    // Parse consents from a hidden input or just hardcode the latest version for the MVP
    const consents = [
      { documentId: "terms", version: "1.0" },
      { documentId: "privacy", version: "1.0" },
    ];

    const result = await IdentityService.registerMember({
      phone: data.phone,
      code: data.code,
      passwordPlain: data.password,
      displayName: data.displayName,
      country: data.country,
      language: data.language,
      userAgent,
      ipAddress,
      consents,
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
  } catch {
    return { success: false, error: "Login failed" };
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
