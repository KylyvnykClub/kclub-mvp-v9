import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { createTranslator } from "next-intl";

import { appendAuditEntry } from "@/data/audit-log";
import {
  findUnspentPartnerInvitation,
  insertConsentRecords,
  insertListingActivation,
  setApplicationRoute,
  type ConsentRecordInsert,
} from "@/data/business-applications";
import type { Db, DbClient } from "@/data/db";
import {
  findActiveInviteLinkById,
  loadInviterStanding,
  spendInviteListingWaiver,
} from "@/data/invite-links";
import {
  applicationTerms,
  CONSENT_KINDS,
  CONSENT_TEXT_VERSION,
  missingConsents,
  paymentAuthorityWording,
  type ApplicationTerms,
  type ConsentKind,
  type PaymentAuthorityWording,
} from "@/domain/business-application";
import { inviteGrantsWaiver } from "@/domain/invites";
import { monthlyPrice } from "@/domain/pricing";
import { env } from "@/env";
import { PENDING_INVITE_COOKIE, openPendingInvite } from "@/lib/pending-invite";
import { CLUB_CONTACT_EMAIL } from "@/lib/contact";
import { clubPartnerLinkPending } from "./partner-link-waiver";

/**
 * The consents a business gives when it applies, from form to record
 * (ADR 0044 §2).
 *
 * The browser says only which boxes were ticked. Everything else is the
 * server's: which route the application is on (from the invitation recorded at
 * registration), which payment wording applies, and the words themselves,
 * rendered here from the same catalogue the form showed. A record is therefore
 * what this server displayed, never a string a client posted.
 */

/** The form field each box posts. Shared with the form component. */
export const CONSENT_FIELDS: Record<ConsentKind, string> = {
  terms: "consentTerms",
  payment_authority: "consentPayment",
  publication: "consentPublication",
  marketing: "consentMarketing",
  eu_early_start: "consentEarlyStart",
};

/** The hidden field carrying the wording the form was rendered with. */
export const RENDERED_WORDING_FIELD = "consentWording";

export function tickedConsents(formData: FormData): Set<ConsentKind> {
  const ticked = new Set<ConsentKind>();
  for (const kind of CONSENT_KINDS) {
    if (formData.get(CONSENT_FIELDS[kind]) === "on") ticked.add(kind);
  }
  return ticked;
}

/** The required boxes, checked before an account or a company exists. */
export function consentsComplete(
  formData: FormData,
  paymentRequired: boolean,
): boolean {
  return (
    missingConsents(tickedConsents(formData), paymentRequired).length === 0
  );
}

export interface ResolvedApplication {
  terms: ApplicationTerms;
  /** Null when there is nothing to pay (the club's partner link). */
  wording: PaymentAuthorityWording | null;
  /** The partner invite link the free month comes from, if any. */
  inviteLinkId: string | null;
}

/**
 * The terms this member's application is filed on, decided now. `invited`
 * comes from the invitation recorded at registration - not from a cookie, and
 * not from the form.
 */
export async function resolveApplication(
  db: DbClient,
  member: { id: string; country: string | null },
  earlyStartRequested: boolean,
  now: Date,
): Promise<ResolvedApplication> {
  const [invitation, clubLinkWaiver] = await Promise.all([
    findUnspentPartnerInvitation(db, member.id),
    clubPartnerLinkPending(db),
  ]);
  const terms = applicationTerms({
    invited: invitation !== undefined,
    clubLinkWaiver,
    residenceCountry: member.country,
    earlyStartRequested,
    now,
  });
  return {
    terms,
    wording: paymentAuthorityWording(terms),
    inviteLinkId:
      terms.route === "invite" ? (invitation?.inviteLinkId ?? null) : null,
  };
}

/**
 * The consent catalogue for one locale, without a request: the records are
 * written from server actions, the outbox and tests alike, and the words must
 * be the same catalogue the form rendered from.
 */
async function consentTranslator(locale: string) {
  const known = locale === "ru" || locale === "uk" ? locale : "en";
  const messages = (
    (await (known === "ru"
      ? import("../../../messages/ru.json")
      : known === "uk"
        ? import("../../../messages/uk.json")
        : import("../../../messages/en.json"))) as {
      default: { applicationConsents: Record<string, string> };
    }
  ).default;
  return createTranslator({
    locale: known,
    messages: { applicationConsents: messages.applicationConsents },
    namespace: "applicationConsents",
  });
}

const PAYMENT_KEY: Record<PaymentAuthorityWording, string> = {
  invite: "paymentInvite",
  public_hold: "paymentPublic",
  public_setup: "paymentDeferred",
};

/** Each box's text exactly as the form shows it, with link markup removed. */
export async function consentTexts(
  locale: string,
  wording: PaymentAuthorityWording | null,
): Promise<Record<ConsentKind, string>> {
  const t = await consentTranslator(locale);
  const plain = (chunks: string) => chunks;
  return {
    terms: t.markup("terms", {
      terms: plain,
      partner: plain,
      refund: plain,
      privacy: plain,
    }),
    payment_authority: wording ? t(PAYMENT_KEY[wording]) : "",
    publication: t("publication"),
    marketing: t("marketing"),
    eu_early_start: t("earlyStart"),
  };
}

/** The disclosure lines shown above the boxes, for the confirmation email. */
export async function disclosureLines(
  locale: string,
  wording: PaymentAuthorityWording | null,
): Promise<string[]> {
  const t = await consentTranslator(locale);
  const price = monthlyPrice("listing", locale);
  if (wording === null) {
    return [t("seller", { email: CLUB_CONTACT_EMAIL }), t("startWaived")];
  }
  const start =
    wording === "invite"
      ? t("startInvite", { price })
      : wording === "public_hold"
        ? t("startPublic", { price })
        : t("startDeferred", { price });
  return [
    t("seller", { email: CLUB_CONTACT_EMAIL }),
    t("price", { price }),
    t("renewal"),
    start,
    t("cancel"),
  ];
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function requestFacts(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  try {
    const list = await headers();
    const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
    return {
      ipAddress: forwarded || null,
      userAgent: list.get("user-agent")?.slice(0, 512) ?? null,
    };
  } catch {
    // Outside a request (a script, a test): the record is still made.
    return { ipAddress: null, userAgent: null };
  }
}

/**
 * Write the ticked boxes as records and the route on the company. Throws if a
 * required box is missing: the callers check first, and a gap here means a
 * caller did not, which must not file an application without its consents.
 */
export async function recordApplicationConsents(
  db: DbClient,
  input: {
    memberId: string;
    companyId: string;
    residenceCountry: string | null;
    locale: string;
    ticked: ReadonlySet<ConsentKind>;
    resolved: ResolvedApplication;
    now: Date;
  },
): Promise<void> {
  const { resolved } = input;
  if (missingConsents(input.ticked, resolved.wording !== null).length > 0) {
    throw new Error("Application consents are incomplete");
  }

  const texts = await consentTexts(input.locale, resolved.wording);
  const facts = await requestFacts();

  const rows: ConsentRecordInsert[] = [...input.ticked]
    // An early start means something only where the withdrawal right applies.
    .filter((kind) => kind !== "eu_early_start" || resolved.terms.euConsumer)
    // Nothing to pay, nothing authorised: no record of a text never shown.
    .filter((kind) => kind !== "payment_authority" || resolved.wording !== null)
    .map((kind) => ({
      memberId: input.memberId,
      companyId: input.companyId,
      kind,
      route: resolved.terms.route,
      wording: kind === "payment_authority" ? resolved.wording : null,
      textVersion: CONSENT_TEXT_VERSION,
      textHash: sha256(texts[kind]),
      text: texts[kind],
      locale: input.locale,
      residenceCountry: input.residenceCountry,
      inviteLinkId: resolved.inviteLinkId,
      ipAddress: facts.ipAddress,
      userAgent: facts.userAgent,
      acceptedAt: input.now,
    }));

  await insertConsentRecords(db, rows);
  await setApplicationRoute(
    db,
    input.companyId,
    resolved.terms.route,
    resolved.inviteLinkId,
  );
}

/**
 * Whether a visitor who is not signed in yet would be on the invite route -
 * for the form's wording only. The route is decided again, from the recorded
 * invitation, when the application is filed; a form rendered on a guess that
 * turned out wrong is refused with "the terms changed" and shown again.
 */
export async function visitorInvitedToTrial(db: Db): Promise<boolean> {
  const cookieStore = await cookies();
  const pending = openPendingInvite(
    cookieStore.get(PENDING_INVITE_COOKIE)?.value,
    env.server.BETTER_AUTH_SECRET,
  );
  if (!pending) return false;
  const link = await findActiveInviteLinkById(db, pending.inviteLinkId);
  if (link?.kind !== "partner") return false;
  const standing = await loadInviterStanding(
    db,
    link.ownerMemberId,
    new Date(),
  );
  return standing !== null && inviteGrantsWaiver(standing, link.kind);
}

/**
 * Everything that follows from the terms once the company exists, in one
 * transaction: the consent records and the route, the invitation spent on
 * this application, and - for a card saved rather than held - the activation
 * record the setup checkout and the publication will fill in.
 */
export async function settleFiledApplication(
  db: Db,
  input: {
    memberId: string;
    companyId: string;
    residenceCountry: string | null;
    locale: string;
    ticked: ReadonlySet<ConsentKind>;
    resolved: ResolvedApplication;
    now: Date;
  },
): Promise<void> {
  const { resolved } = input;
  await db.transaction(async (tx) => {
    await recordApplicationConsents(tx, input);

    if (resolved.terms.route === "invite") {
      // The free month belongs to the first application filed, as the
      // waiver did (ADR 0042). Conditional in the UPDATE, so two
      // applications filed at once cannot both take it.
      const spent = await spendInviteListingWaiver(
        tx,
        input.memberId,
        input.now,
      );
      if (!spent) throw new Error("The invitation was already used");
    }

    if (resolved.terms.collection === "setup") {
      await insertListingActivation(tx, {
        companyId: input.companyId,
        memberId: input.memberId,
        route: resolved.terms.route,
        freeMonth: resolved.terms.route === "invite",
        startNotBefore: resolved.terms.startNotBefore,
      });
    }

    await appendAuditEntry(tx, {
      actorType: "member",
      actorId: input.memberId,
      action: "company.application_terms",
      subjectType: "company",
      subjectId: input.companyId,
      meta: {
        route: resolved.terms.route,
        collection: resolved.terms.collection,
        wording: resolved.wording,
        startNotBefore: resolved.terms.startNotBefore?.toISOString() ?? null,
      },
    });
  });
}
