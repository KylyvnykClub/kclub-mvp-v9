"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import {
  createMembershipCheckoutAction,
  createVipCheckoutAction,
} from "@/actions/stripe";
import { Button } from "@/components/ui/button";
import type { DuesOffer } from "@/domain/pricing";
import { CLUB_CONTACT_EMAIL } from "@/lib/contact";

/**
 * The two ways into the club and the one box both need (ADR 0044 §2 for
 * members): the seller, renewal and cancellation are disclosed, the payment
 * authority is ticked by the member, and only then do the buttons open Stripe.
 * Each form posts the box itself; the server records its own words for it
 * and refuses a request without it.
 *
 * Which plans, and which wording, is `duesOffer`'s decision (ADR 0043).
 */
export function DuesPaymentChoice({
  price,
  vipPrice,
  offer,
}: {
  price: string;
  vipPrice: string;
  offer: DuesOffer;
}) {
  const t = useTranslations("membership");
  const tc = useTranslations("membershipConsent");
  const [ticked, setTicked] = useState(false);

  const button = (primary: boolean, label: string) => (
    <Button
      type="submit"
      disabled={!ticked}
      variant={primary ? "default" : "outline"}
      className={payButtonClass(primary)}
    >
      {label}
    </Button>
  );
  const consentField = ticked ? (
    <>
      <input type="hidden" name="consentPayment" value="on" />
      <input type="hidden" name="consentWording" value={offer.wording} />
    </>
  ) : null;

  return (
    <div className="w-full space-y-4">
      <div className="space-y-1 border border-border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
        <p>{tc("seller", { email: CLUB_CONTACT_EMAIL })}</p>
        <p>{tc("renewal")}</p>
        <p>{tc("cancel")}</p>
      </div>

      <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-foreground">
        <input
          type="checkbox"
          checked={ticked}
          onChange={(event) => setTicked(event.target.checked)}
          className="mt-1 size-4 shrink-0 accent-[#d8b261]"
        />
        <span>
          {offer.wording === "vip_new"
            ? tc("paymentVipNew", { vipPrice })
            : tc("payment", { price, vipPrice })}
        </span>
      </label>
      {!ticked && (
        <p className="text-sm text-muted-foreground">{tc("missing")}</p>
      )}

      <div className="flex w-full flex-col gap-3">
        {offer.plans.map((plan, index) =>
          plan === "vip" ? (
            <form
              key={plan}
              action={createVipCheckoutAction}
              className="w-full"
            >
              {consentField}
              {button(index === 0, t("vipPayButton", { vipPrice }))}
            </form>
          ) : (
            <form
              key={plan}
              action={createMembershipCheckoutAction}
              className="w-full"
            >
              {consentField}
              {button(index === 0, t("payButton", { price }))}
            </form>
          ),
        )}
      </div>
    </div>
  );
}

/** The chosen plan's button is the gold one; the other is outlined. */
function payButtonClass(primary: boolean): string {
  const base = "h-12 w-full text-xs font-black uppercase tracking-[0.16em]";
  return primary
    ? `${base} bg-accent text-accent-foreground hover:bg-[#b49126]`
    : `${base} border-accent/60 text-foreground hover:bg-accent/10`;
}
