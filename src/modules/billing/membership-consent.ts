import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createTranslator } from "next-intl";

import { insertConsentRecords } from "@/data/business-applications";
import type { DbClient } from "@/data/db";
import { CONSENT_TEXT_VERSION } from "@/domain/business-application";
import { monthlyPrice } from "@/domain/pricing";

/**
 * The payment authority for membership dues and VIP (ADR 0044 §2, applied to
 * members): the box above the Stripe buttons on the dues screen and in
 * Billing. The browser says only that it was ticked; the words recorded are
 * this server's, from the catalogue the screen rendered.
 *
 * Recorded in `consent_records` beside a business's consents, with no
 * company and a wording naming what was authorised.
 */

/** The form field the box posts. */
export const MEMBERSHIP_CONSENT_FIELD = "consentPayment";

/** The hidden field naming the wording the screen showed. */
export const MEMBERSHIP_WORDING_FIELD = "consentWording";

/**
 * - `member_dues` - the dues screen: one box naming both plans' prices.
 * - `vip_new` - Billing, for a member with no dues subscription.
 * - `vip_switch` - Billing, switching a dues subscription to VIP.
 */
export type MembershipConsentWording = "member_dues" | "vip_new" | "vip_switch";

const WORDINGS: readonly MembershipConsentWording[] = [
  "member_dues",
  "vip_new",
  "vip_switch",
];

export function membershipConsentTicked(formData: FormData | undefined) {
  return formData?.get(MEMBERSHIP_CONSENT_FIELD) === "on";
}

/** The wording the form says it showed, if it is one of ours. */
export function postedMembershipWording(
  formData: FormData | undefined,
): MembershipConsentWording | null {
  const value = formData?.get(MEMBERSHIP_WORDING_FIELD);
  return WORDINGS.find((wording) => wording === value) ?? null;
}

async function translator(locale: string) {
  const known = locale === "ru" || locale === "uk" ? locale : "en";
  const messages = (
    (await (known === "ru"
      ? import("../../../messages/ru.json")
      : known === "uk"
        ? import("../../../messages/uk.json")
        : import("../../../messages/en.json"))) as {
      default: { membershipConsent: Record<string, string> };
    }
  ).default;
  return {
    known,
    t: createTranslator({
      locale: known,
      messages: { membershipConsent: messages.membershipConsent },
      namespace: "membershipConsent",
    }),
  };
}

export async function membershipConsentText(
  locale: string,
  wording: MembershipConsentWording,
): Promise<string> {
  const { known, t } = await translator(locale);
  const price = monthlyPrice("membership", known);
  const vipPrice = monthlyPrice("vip", known);
  if (wording === "member_dues") return t("payment", { price, vipPrice });
  if (wording === "vip_new") return t("paymentVipNew", { vipPrice });
  return t("paymentVip", { vipPrice });
}

export async function recordMembershipPaymentAuthority(
  db: DbClient,
  input: {
    memberId: string;
    locale: string;
    residenceCountry: string | null;
    wording: MembershipConsentWording;
    now: Date;
  },
): Promise<void> {
  const text = await membershipConsentText(input.locale, input.wording);
  let ipAddress: string | null = null;
  let userAgent: string | null = null;
  try {
    const list = await headers();
    ipAddress = list.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    userAgent = list.get("user-agent")?.slice(0, 512) ?? null;
  } catch {
    // Outside a request: the record is still made.
  }

  await insertConsentRecords(db, [
    {
      memberId: input.memberId,
      companyId: null,
      kind: "payment_authority",
      route: "public",
      wording: input.wording,
      textVersion: CONSENT_TEXT_VERSION,
      textHash: createHash("sha256").update(text).digest("hex"),
      text,
      locale: input.locale,
      residenceCountry: input.residenceCountry,
      inviteLinkId: null,
      ipAddress,
      userAgent,
      acceptedAt: input.now,
    },
  ]);
}
