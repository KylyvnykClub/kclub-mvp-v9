/**
 * What a registration must contain (FR-001, ADR 0032).
 *
 * A plain module rather than a const inside the Server Action, for one
 * reason: the requirement that both identifiers are mandatory is enforced
 * here and nowhere else — `members.email` stays nullable for the accounts
 * that predate ADR 0032 — so this is the only place a test can prove it.
 *
 * The counterpart to `src/lib/phone.ts` and `src/lib/email.ts`, which decide
 * what each identifier is; this decides which of them a new member needs.
 */

import { z } from "zod";

import { CONSENT_DOCUMENT_IDS } from "@/lib/legal-consents";
import { emailSchema } from "@/lib/email";
import { phoneSchema } from "@/lib/phone";

export const consentAcceptanceSchema = z.object({
  documentId: z.enum(CONSENT_DOCUMENT_IDS),
  version: z.string().min(1).max(50),
});

export const registerSchema = z.object({
  phone: phoneSchema,
  // Required (ADR 0032). Both identifiers are collected at registration; the
  // column stays nullable for the accounts that predate this rule, so the
  // requirement lives at the boundary that creates members and nowhere else.
  email: emailSchema,
  // Optional at the boundary because the code is only demanded when phone
  // verification is enabled (ADR 0012); the service decides, not the form.
  code: z.string().min(6).max(6).optional(),
  turnstileToken: z.string().max(2048).optional(),
  password: z.string().min(8).max(100),
  displayName: z.string().min(2).max(255),
  country: z.string().length(2),
  language: z.string().length(2),
  consents: z.array(consentAcceptanceSchema),
});

export type RegisterInput = z.infer<typeof registerSchema>;
