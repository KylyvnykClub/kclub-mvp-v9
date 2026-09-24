"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

import { createCheckoutSessionAction } from "@/actions/stripe";
import { Button } from "@/components/ui/button";
import { listingCheckoutEligibility } from "@/domain/listing-checkout";

/**
 * Where a business partner stands, on the screen a member would see the dues
 * ask on (FR-110, FR-111).
 *
 * A partner never owes the $4.99. What holds them outside the club is the
 * listing, and the listing is not payable until a moderator has approved the
 * application — so this screen is a status board with at most one button on
 * it, and the button only exists once there is something honest to charge for.
 */

export type PartnerApplication = {
  id: string;
  name: string;
  moderationStatus: string;
  rejectionReason: string | null;
};

export function PartnerStanding({
  application,
  price,
  sellable,
}: {
  application: PartnerApplication | null;
  price: string;
  /** False when no Stripe price is configured; the button is then not offered. */
  sellable: boolean;
}) {
  const t = useTranslations("partnerStanding");
  const locale = useLocale();
  const [pending, start] = useTransition();

  if (!application) {
    return (
      <div className="space-y-5">
        <p className="text-sm leading-6 text-muted-foreground">
          {t("noApplication")}
        </p>
        <Button asChild className="h-12 w-full">
          <Link href={`/${locale}/partner`}>{t("startApplication")}</Link>
        </Button>
      </div>
    );
  }

  const eligibility = listingCheckoutEligibility(application);

  if (eligibility === "rejected") {
    return (
      <div className="space-y-4">
        <p className="text-sm font-bold uppercase tracking-[0.12em] text-destructive">
          {t("rejectedTitle")}
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          {t("rejectedBody", { name: application.name })}
        </p>
        {application.rejectionReason && (
          <blockquote className="border-l-2 border-border pl-4 text-sm italic leading-6 text-foreground">
            {application.rejectionReason}
          </blockquote>
        )}
        {/* Nothing was charged, and saying so is the point (ADR 0036). */}
        <p className="text-sm leading-6 text-muted-foreground">
          {t("rejectedNoCharge")}
        </p>
      </div>
    );
  }

  if (eligibility !== "eligible") {
    return (
      <div className="space-y-4">
        <p className="text-sm font-bold uppercase tracking-[0.12em] text-accent-ink">
          {t("pendingTitle")}
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          {t("pendingBody", { name: application.name })}
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          {t("pendingNoCharge", { price })}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm font-bold uppercase tracking-[0.12em] text-accent-ink">
        {t("approvedTitle")}
      </p>
      <p className="text-sm leading-6 text-muted-foreground">
        {t("approvedBody", { name: application.name })}
      </p>
      {sellable ? (
        <Button
          className="h-12 w-full bg-accent text-xs font-black uppercase tracking-[0.16em] text-accent-foreground hover:bg-[#b49126]"
          disabled={pending}
          onClick={() =>
            start(async () => {
              // Ends in a redirect to Stripe, so nothing after it runs on the
              // happy path. Access appears when the subscription is projected
              // from Stripe's own event, never from the return (FR-104).
              await createCheckoutSessionAction(application.id);
            })
          }
        >
          {pending ? t("payOpening") : t("payButton", { price })}
        </Button>
      ) : (
        <p
          role="alert"
          className="border border-destructive/30 bg-destructive/10 p-3 text-center text-sm font-medium text-destructive"
        >
          {t("unavailable")}
        </p>
      )}
    </div>
  );
}
