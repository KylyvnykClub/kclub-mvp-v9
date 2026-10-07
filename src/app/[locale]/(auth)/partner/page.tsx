import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getCurrentMember } from "@/actions/session";
import { db } from "@/data/db";
import {
  awaitsPaymentOutsideClub,
  ownsLiveApplication,
} from "@/data/membership-access";
import { env } from "@/env";
import { getLegalDocument } from "@/lib/mdx";
import { monthlyPrice } from "@/domain/pricing";
import { PartnerApplicationForm } from "./_components/partner-application-form";
import { findUnspentPartnerInvitation } from "@/data/business-applications";
import { visitorInvitedToTrial } from "@/modules/catalogue/application-consents";
import { clubPartnerLinkPending } from "@/modules/catalogue/partner-link-waiver";

/**
 * Business partner registration (FR-109).
 *
 * The destination of the "Business" card on the landing page. It used to point
 * at `/register`, which is the member sign-up: a business that clicked it was
 * asked for a display name and a country, paid $4.99 to join a club it had not
 * asked to join, and only then — three screens later, behind a dues gate — met
 * the form it came for.
 *
 * Outside `(dashboard)` on purpose, for the same reason the dues screen is: a
 * business filing an application is not inside the club yet, and the gate that
 * protects the club would otherwise keep them from the form that gets them in.
 *
 * Four ways to arrive, four answers:
 * - signed out — the whole thing, account and application, on one page;
 * - a partner whose account exists but whose application does not — the
 *   application half, so a half-finished registration can be finished;
 * - a member whose dues are unpaid and who has no company yet — the
 *   application half too: the dashboard is closed to them (FR-103), and the
 *   listing is paid for on its own (ADR 0037);
 * - anybody else who is signed in — the dashboard's own form, which is the
 *   same questions with a draft behind them.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "partnerApply" });
  return { title: t("title"), description: t("subtitle") };
}

export default async function PartnerApplicationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const current = await getCurrentMember();

  if (current?.member) {
    // A member in the club registers a company from the dashboard. One whose
    // dues are unpaid cannot reach the dashboard (FR-103), so they file here;
    // the listing is its own payment either way (ADR 0037), and the dues
    // screen then shows the application's standing.
    if (
      current.member.duesKind !== "partner" &&
      !(await awaitsPaymentOutsideClub(db, current.member, new Date()))
    ) {
      redirect(`/${locale}/dashboard/company/new`);
    }

    // A live application (pending or approved) has its outcome and payment on
    // the standing screen (FR-110, FR-111). A rejected one does not stop the
    // applicant from filing again here.
    if (await ownsLiveApplication(db, current.member.id)) {
      redirect(`/${locale}/membership`);
    }
  }

  // ADR 0044: which terms the form shows. Decided again on submit; a guess
  // that turns out wrong is refused with "the terms changed".
  const [terms, privacy, invited, waived] = await Promise.all([
    getLegalDocument("terms-of-use", locale),
    getLegalDocument("privacy-policy", locale),
    current?.member
      ? findUnspentPartnerInvitation(db, current.member.id).then(Boolean)
      : visitorInvitedToTrial(db),
    clubPartnerLinkPending(db),
  ]);

  return (
    <PartnerApplicationForm
      signedIn={Boolean(current?.member)}
      termsVersion={terms?.version ?? null}
      privacyVersion={privacy?.version ?? null}
      turnstileSiteKey={env.client.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null}
      listingPrice={monthlyPrice("listing", locale)}
      invited={invited}
      waived={waived}
      residenceCountry={current?.member?.country ?? null}
    />
  );
}
