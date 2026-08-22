"use client";

import { useTransition } from "react";
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

export function BillingSection({ tier }: { tier: "free" | "vip" }) {
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("billing");

  const handleCheckout = () => {
    startTransition(async () => {
      try {
        await createVipCheckoutAction();
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
    <Card className="bg-card/50 backdrop-blur-sm border-border/50 shadow-sm max-w-2xl">
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
            <Button
              onClick={handleCheckout}
              disabled={isPending}
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
