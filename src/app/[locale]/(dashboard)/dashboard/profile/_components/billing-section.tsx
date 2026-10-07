"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  createVipCheckoutAction,
  createPortalSessionAction,
} from "@/actions/stripe";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CLUB_CONTACT_EMAIL } from "@/lib/contact";

export function BillingSection({
  tier,
  switching,
  vipPrice,
}: {
  tier: "free" | "vip";
  /** Paying $4.99 now: VIP switches that subscription (ADR 0043). */
  switching: boolean;
  vipPrice: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [ticked, setTicked] = useState(false);
  const t = useTranslations("billing");
  const tc = useTranslations("membershipConsent");

  const handleCheckout = () => {
    startTransition(async () => {
      // The payment authority box, posted with the words it showed; the
      // server refuses without it and records its own text (ADR 0044 §2).
      const formData = new FormData();
      formData.set("consentPayment", ticked ? "on" : "");
      formData.set("consentWording", switching ? "vip_switch" : "vip_new");
      try {
        await createVipCheckoutAction(formData);
      } catch {
        alert(t("checkoutFailed"));
      }
    });
  };

  const handlePortal = () => {
    startTransition(async () => {
      try {
        await createPortalSessionAction();
      } catch {
        alert(t("portalFailed"));
      }
    });
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50 shadow-sm">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl font-serif text-accent-ink">
              {t("title")}
            </CardTitle>
            <CardDescription className="mt-1">
              {t("description")}
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={tier === "vip" ? "text-accent-ink border-accent" : ""}
          >
            {tier.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {tier === "free" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("freeDescription")}
            </p>
            <div className="space-y-1 border border-border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
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
                {switching
                  ? tc("paymentVip", { vipPrice })
                  : tc("paymentVipNew", { vipPrice })}
              </span>
            </label>
            <Button
              onClick={handleCheckout}
              disabled={isPending || !ticked}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {isPending ? t("loading") : t("upgradeButton")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("vipDescription")}
            </p>
            <Button
              onClick={handlePortal}
              disabled={isPending}
              variant="outline"
            >
              {isPending ? t("loading") : t("manageButton")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
