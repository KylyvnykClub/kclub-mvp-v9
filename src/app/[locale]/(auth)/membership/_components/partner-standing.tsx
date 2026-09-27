"use client";

import { useFormStatus } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createListingHoldCheckoutAction } from "@/actions/stripe";
import { Button } from "@/components/ui/button";
import type { PartnerPaymentStanding } from "@/domain/listing-hold";

/**
 * Where a business partner stands, on the screen a member would see the dues
 * ask on (FR-110, FR-113…FR-115).
 *
 * A partner never owes the $4.99. What holds them outside the club is the
 * listing: its price is reserved on their card while the application is
 * reviewed, charged when it is approved, and released when it is refused
 * (ADR 0037). So this screen is a status board, and the one button on it
 * reserves the price - it never charges it.
 */

export type PartnerApplication = {
  id: string;
  name: string;
  rejectionReason: string | null;
};

export function PartnerStanding({
  application,
  standing,
  holdExpiresAt,
  price,
  sellable,
  returnedFromCheckout,
}: {
  application: PartnerApplication | null;
  /** Null when there is no application yet. */
  standing: PartnerPaymentStanding | null;
  /** When the card network releases the current reservation, if one is held. */
  holdExpiresAt: string | null;
  price: string;
  /** False when no Stripe price is configured; the button is then not offered. */
  sellable: boolean;
  /** Back from Stripe Checkout; Stripe's own event may not have arrived yet. */
  returnedFromCheckout: boolean;
}) {
  const t = useTranslations("partnerStanding");
  const locale = useLocale();

  if (!application || standing === null) {
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

  if (standing === "rejected") {
    return (
      <div className="space-y-4">
        <Title tone="negative">{t("rejectedTitle")}</Title>
        <Body>{t("rejectedBody", { name: application.name })}</Body>
        {application.rejectionReason && (
          <blockquote className="border-l-2 border-border pl-4 text-sm italic leading-6 text-foreground">
            {application.rejectionReason}
          </blockquote>
        )}
        <Body>{t("rejectedHoldReleased")}</Body>
      </div>
    );
  }

  if (standing === "held") {
    const expires = holdExpiresAt
      ? new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
          new Date(holdExpiresAt),
        )
      : null;

    return (
      <div className="space-y-4">
        <Title>{t("heldTitle")}</Title>
        <Body>{t("heldBody", { name: application.name, price })}</Body>
        <Body>{t("heldOutcomes", { price })}</Body>
        {expires && <Body>{t("heldExpires", { date: expires })}</Body>}
      </div>
    );
  }

  if (standing === "confirming" || standing === "paid") {
    return (
      <div className="space-y-4">
        <Title>{t("confirmingTitle")}</Title>
        <Body>{t("confirmingBody", { name: application.name, price })}</Body>
        <RefreshLink label={t("refresh")} />
      </div>
    );
  }

  // `authorise` while in review, `pay` once approved. Same button: the price
  // is reserved either way, and an approved application's reservation is
  // captured as soon as Stripe reports it.
  const approved = standing === "pay";

  return (
    <div className="space-y-5">
      <Title>{approved ? t("payTitle") : t("authoriseTitle")}</Title>
      <Body>
        {approved
          ? t("payBody", { name: application.name, price })
          : t("authoriseBody", { name: application.name, price })}
      </Body>
      {!approved && <Body>{t("authoriseOutcomes", { price })}</Body>}

      {returnedFromCheckout && (
        <p
          role="status"
          className="border border-border bg-muted/40 p-3 text-sm leading-6 text-foreground"
        >
          {t("returnedPending")} <RefreshLink label={t("refresh")} />
        </p>
      )}

      {sellable ? (
        <form
          action={createListingHoldCheckoutAction.bind(null, application.id)}
        >
          <HoldButton
            label={
              approved
                ? t("payButton", { price })
                : t("authoriseButton", { price })
            }
            pendingLabel={t("payOpening")}
          />
        </form>
      ) : (
        <p
          role="alert"
          className="border border-destructive/30 bg-destructive/10 p-3 text-center text-sm font-medium text-destructive"
        >
          {t("unavailable")}
        </p>
      )}

      <p className="text-xs leading-5 text-muted-foreground">
        {t("renewalNote", { price })}
      </p>
    </div>
  );
}

function Title({
  children,
  tone = "accent",
}: {
  children: React.ReactNode;
  tone?: "accent" | "negative";
}) {
  return (
    <p
      className={`text-sm font-bold uppercase tracking-[0.12em] ${
        tone === "negative" ? "text-destructive" : "text-accent-ink"
      }`}
    >
      {children}
    </p>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-6 text-muted-foreground">{children}</p>;
}

/** Re-reads the page from the server; the state comes from Stripe's events. */
function RefreshLink({ label }: { label: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      className="font-bold text-foreground underline hover:text-accent-ink"
    >
      {label}
    </button>
  );
}

function HoldButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-12 w-full bg-accent text-xs font-black uppercase tracking-[0.16em] text-accent-foreground hover:bg-[#b49126]"
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}
