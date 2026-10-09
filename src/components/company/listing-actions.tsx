"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import {
  cancelListingRenewalAction,
  confirmListingConsentsAction,
  withdrawApplicationAction,
  withdrawFromContractAction,
} from "@/actions/listing-cancellation";
import { Button } from "@/components/ui/button";
import {
  ApplicationConsents,
  useApplicationConsents,
} from "./application-consents";

/**
 * The partner's own ways out of a listing (ADR 0044 §4, §5), shown on every
 * screen that shows a listing's standing: withdraw the application before
 * approval, cancel the auto-renewal, and - for an EU/EEA consumer within 14
 * days - withdraw from the contract. Visible, one confirmation each, no call
 * or survey in the way.
 */

export interface ListingActionsExtras {
  canWithdrawApplication: boolean;
  euWithdrawalOpen: boolean;
  canCancelRenewal: boolean;
  renewalEndsAt: string | null;
}

export function ListingActions({
  companyId,
  extras,
}: {
  companyId: string;
  extras: ListingActionsExtras;
}) {
  const t = useTranslations("listingActions");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(new Date(iso));

  const run = (
    confirmText: string,
    action: (
      id: string,
    ) => Promise<
      { success: true; endsAt?: string } | { success: false; error: string }
    >,
    done: (endsAt?: string) => string,
  ) => {
    if (!window.confirm(confirmText)) return;
    start(async () => {
      const result = await action(companyId);
      setMessage(
        result.success
          ? done(result.endsAt)
          : t(`error.${result.error}` as "error.failed"),
      );
      router.refresh();
    });
  };

  const nothing =
    !extras.canWithdrawApplication &&
    !extras.euWithdrawalOpen &&
    !extras.canCancelRenewal &&
    !extras.renewalEndsAt;
  if (nothing && !message) return null;

  return (
    <div className="space-y-3 border-t border-border pt-4">
      {extras.renewalEndsAt && (
        <p className="text-sm leading-6 text-foreground">
          {t("renewalCancelled", { date: date(extras.renewalEndsAt) })}
        </p>
      )}

      {extras.canCancelRenewal && (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          className="w-full"
          onClick={() =>
            run(
              t("cancelRenewalConfirm"),
              cancelListingRenewalAction,
              (endsAt) =>
                t("renewalCancelled", { date: endsAt ? date(endsAt) : "" }),
            )
          }
        >
          {t("cancelRenewal")}
        </Button>
      )}

      {extras.canWithdrawApplication && (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          className="w-full"
          onClick={() =>
            run(t("withdrawConfirm"), withdrawApplicationAction, () =>
              t("withdrawDone"),
            )
          }
        >
          {t("withdraw")}
        </Button>
      )}

      {extras.euWithdrawalOpen && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            className="w-full border-destructive/50 text-destructive"
            onClick={() =>
              run(t("euWithdrawConfirm"), withdrawFromContractAction, () =>
                t("euWithdrawDone"),
              )
            }
          >
            {t("euWithdraw")}
          </Button>
          <p className="text-xs leading-5 text-muted-foreground">
            {t("euWithdrawNote")}
          </p>
        </div>
      )}

      {message && (
        <p role="status" className="text-sm font-medium text-foreground">
          {message}
        </p>
      )}
    </div>
  );
}

/**
 * The consents for an application filed before they were recorded: the same
 * disclosure and boxes as a new application, then on to Stripe.
 */
export function ConsentBeforePayment({
  companyId,
  listingPrice,
  terms,
}: {
  companyId: string;
  listingPrice: string;
  terms: { invited: boolean; waived: boolean; residenceCountry: string | null };
}) {
  const t = useTranslations("listingActions");
  const consents = useApplicationConsents(terms);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        start(async () => {
          const result = await confirmListingConsentsAction(
            companyId,
            formData,
          );
          // Success redirects to Stripe; only a refusal comes back.
          if (result && !result.success) {
            setError(t(`error.${result.error}` as "error.failed"));
          }
        });
      }}
    >
      <p className="text-sm leading-6 text-muted-foreground">
        {t("consentFirst")}
      </p>
      <ApplicationConsents listingPrice={listingPrice} consents={consents} />
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      <Button
        type="submit"
        disabled={pending || !consents.state.complete}
        className="h-auto min-h-12 w-full whitespace-normal bg-accent px-4 py-3 text-center text-xs leading-snug font-black text-balance uppercase tracking-[0.16em] text-accent-foreground hover:bg-[#b49126]"
      >
        {consents.state.submitLabel}
      </Button>
      {consents.state.submitNote && (
        <p className="text-center text-sm text-muted-foreground">
          {consents.state.submitNote}
        </p>
      )}
    </form>
  );
}
