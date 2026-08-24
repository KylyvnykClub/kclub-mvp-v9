"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  createCheckoutSessionAction,
  createPortalSessionAction,
} from "@/actions/stripe";
import type { CompanyRow } from "@/data/companies";
import type { SubscriptionRow } from "@/data/billing";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function CompanyList({
  companies,
  subscriptions,
}: {
  companies: CompanyRow[];
  subscriptions: SubscriptionRow[];
}) {
  const t = useTranslations("billing");
  const tCompany = useTranslations("company");
  const [isPending, startTransition] = useTransition();

  const handleCheckout = (companyId: string) => {
    startTransition(async () => {
      try {
        await createCheckoutSessionAction(companyId);
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
        alert(t("portalFailedAlert"));
      }
    });
  };

  const moderationLabel = (status: string) => {
    if (status === "approved") return tCompany("moderationApproved");
    if (status === "rejected") return tCompany("moderationRejected");
    return tCompany("moderationPending");
  };

  if (companies.length === 0) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50 shadow-sm max-w-2xl">
        <CardContent className="p-8 text-center text-muted-foreground">
          {t("noCompanies")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {companies.map((company) => {
        const sub = subscriptions.find((s) => s.companyId === company.id);
        const isActive = sub?.status === "active";

        return (
          <Card
            key={company.id}
            className="bg-card/50 backdrop-blur-sm border-border/50 shadow-sm"
          >
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-xl font-serif text-accent-ink">
                    {company.name}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {t("moderationStatusLabel")}{" "}
                    <Badge variant="outline" className="uppercase text-[10px]">
                      {moderationLabel(company.moderationStatus)}
                    </Badge>
                  </CardDescription>
                </div>
                {isActive ? (
                  <Badge className="bg-green-500/20 text-green-500 hover:bg-green-500/30">
                    {t("paid")}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    {t("unpaid")}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isActive ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {t("activeListing")}
                  </p>
                  <Button
                    onClick={handlePortal}
                    disabled={isPending}
                    variant="outline"
                  >
                    {isPending ? t("loading") : t("manageButton")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {t("listingRequired")}
                  </p>
                  <Button
                    onClick={() => handleCheckout(company.id)}
                    disabled={isPending}
                    className="bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    {isPending ? t("loading") : t("subscribeListing")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
