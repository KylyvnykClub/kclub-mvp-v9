"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

import {
  applicationTerms,
  paymentAuthorityWording,
  type ConsentKind,
  type PaymentAuthorityWording,
} from "@/domain/business-application";
import { CLUB_CONTACT_EMAIL } from "@/lib/contact";

/**
 * The disclosure and the consent boxes of a business application (ADR 0044),
 * placed under the account block and before the Stripe button.
 *
 * Every box starts empty and is ticked by the applicant. The form posts which
 * boxes were ticked and the wording it showed - nothing else. The server
 * decides the terms again, records the words from its own catalogue, and
 * refuses the submit if they are not the ones shown here.
 *
 * The field names mirror `CONSENT_FIELDS` in the server module; they are
 * repeated rather than imported because that module is server-only.
 */
const FIELD: Record<ConsentKind, string> = {
  terms: "consentTerms",
  payment_authority: "consentPayment",
  publication: "consentPublication",
  marketing: "consentMarketing",
  eu_early_start: "consentEarlyStart",
};

const PAYMENT_KEY: Record<PaymentAuthorityWording, string> = {
  invite: "paymentInvite",
  public_hold: "paymentPublic",
  public_setup: "paymentDeferred",
};

const START_KEY: Record<PaymentAuthorityWording, string> = {
  invite: "startInvite",
  public_hold: "startPublic",
  public_setup: "startDeferred",
};

const SUBMIT_KEY: Record<PaymentAuthorityWording | "none", string> = {
  invite: "submitInvite",
  public_hold: "submitPublic",
  public_setup: "submitDeferred",
  none: "submitWaived",
};

export interface ConsentState {
  wording: PaymentAuthorityWording | null;
  complete: boolean;
  submitLabel: string;
  submitNote: string | null;
}

/**
 * The terms the form shows, computed in the browser from what the server
 * passed (invited, waived) and what the applicant chose (country, early
 * start) - exactly as `applicationTerms` will compute them on submit.
 */
export function useApplicationConsents(input: {
  invited: boolean;
  waived: boolean;
  residenceCountry: string | null;
}) {
  const t = useTranslations("applicationConsents");
  const [ticked, setTicked] = useState<Set<ConsentKind>>(new Set());

  const terms = applicationTerms({
    invited: input.invited,
    clubLinkWaiver: input.waived,
    residenceCountry: input.residenceCountry,
    earlyStartRequested: ticked.has("eu_early_start"),
    now: new Date(),
  });
  const wording = paymentAuthorityWording(terms);
  const complete =
    ticked.has("terms") &&
    ticked.has("publication") &&
    (wording === null || ticked.has("payment_authority"));

  const toggle = (kind: ConsentKind, on: boolean) =>
    setTicked((current) => {
      const next = new Set(current);
      if (on) next.add(kind);
      else next.delete(kind);
      // An early start changes the payment wording (a reservation now, or a
      // saved card later), so a payment box ticked against the other text is
      // cleared rather than carried over to words it was not given for.
      if (kind === "eu_early_start") next.delete("payment_authority");
      return next;
    });

  const state: ConsentState = {
    wording,
    complete,
    submitLabel: t(SUBMIT_KEY[wording ?? "none"]),
    submitNote: wording === "invite" ? t("submitInviteNote") : null,
  };

  return { state, terms, ticked, toggle };
}

export function ApplicationConsents({
  listingPrice,
  consents,
}: {
  listingPrice: string;
  consents: ReturnType<typeof useApplicationConsents>;
}) {
  const t = useTranslations("applicationConsents");
  const locale = useLocale();
  const { state, terms, ticked, toggle } = consents;
  const { wording } = state;

  const doc = (slug: string) => (chunks: React.ReactNode) => (
    <Link
      href={`/${locale}/legal/${slug}`}
      target="_blank"
      rel="noopener"
      className="font-bold underline hover:text-accent-ink"
    >
      {chunks}
    </Link>
  );

  const box = (
    kind: ConsentKind,
    label: React.ReactNode,
    required: boolean,
  ) => (
    <label
      key={kind}
      className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-foreground"
    >
      <input
        type="checkbox"
        name={FIELD[kind]}
        checked={ticked.has(kind)}
        onChange={(event) => toggle(kind, event.target.checked)}
        required={required}
        aria-required={required}
        className="mt-1 size-4 shrink-0 accent-[#d8b261]"
      />
      <span>{label}</span>
    </label>
  );

  return (
    <section className="space-y-5 border-t border-border pt-6">
      <input type="hidden" name="consentWording" value={wording ?? "none"} />

      <div className="space-y-2 border border-border bg-muted/30 p-4 text-sm leading-6">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
          {t("disclosureTitle")}
        </p>
        <p>{t("seller", { email: CLUB_CONTACT_EMAIL })}</p>
        {wording === null ? (
          <p>{t("startWaived")}</p>
        ) : (
          <>
            <p>{t("price", { price: listingPrice })}</p>
            <p>{t("renewal")}</p>
            <p>{t(START_KEY[wording], { price: listingPrice })}</p>
            <p>{t("cancel")}</p>
          </>
        )}
        {terms.euConsumer && wording !== null && (
          <p className="font-medium">{t("euInfo")}</p>
        )}
      </div>

      <div className="space-y-4">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
          {t("consentsTitle")}
        </p>
        <p className="text-sm text-muted-foreground">{t("consentsNote")}</p>
        {box(
          "terms",
          t.rich("terms", {
            terms: doc("terms-of-use"),
            partner: doc("partner-rules"),
            refund: doc("refund-policy"),
            privacy: doc("privacy-policy"),
          }),
          true,
        )}
        {wording !== null &&
          box("payment_authority", t(PAYMENT_KEY[wording]), true)}
        {box("publication", t("publication"), true)}
        {box("marketing", t("marketing"), false)}
        {terms.euConsumer &&
          wording !== null &&
          box("eu_early_start", t("earlyStart"), false)}
      </div>

      {!state.complete && (
        <p className="text-sm text-muted-foreground">{t("missing")}</p>
      )}
    </section>
  );
}
