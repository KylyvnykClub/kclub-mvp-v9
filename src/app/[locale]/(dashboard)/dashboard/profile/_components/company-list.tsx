"use client";

import { useTransition } from "react";
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
  const [isPending, startTransition] = useTransition();

  const handleCheckout = (companyId: string) => {
    startTransition(async () => {
      const priceId =
        process.env.NEXT_PUBLIC_STRIPE_LISTING_PRICE_ID ||
        "price_dummy_listing";
      try {
        await createCheckoutSessionAction(priceId, companyId);
      } catch {
        alert("Failed to start checkout");
      }
    });
  };

  const handlePortal = () => {
    startTransition(async () => {
      try {
        await createPortalSessionAction();
      } catch {
        alert("Failed to open portal");
      }
    });
  };

  if (companies.length === 0) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50 shadow-sm max-w-2xl">
        <CardContent className="p-8 text-center text-muted-foreground">
          You have not registered any companies yet.
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
                  <CardTitle className="text-xl font-serif text-accent">
                    {company.name}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Moderation Status:{" "}
                    <Badge variant="outline" className="uppercase text-[10px]">
                      {company.moderationStatus}
                    </Badge>
                  </CardDescription>
                </div>
                {isActive ? (
                  <Badge className="bg-green-500/20 text-green-500 hover:bg-green-500/30">
                    PAID
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    UNPAID
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isActive ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    This company has an active listing subscription.
                  </p>
                  <Button
                    onClick={handlePortal}
                    disabled={isPending}
                    variant="outline"
                  >
                    {isPending ? "Loading..." : "Manage Subscription"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    To publish this company in the public directory (once
                    approved), an active listing subscription is required.
                  </p>
                  <Button
                    onClick={() => handleCheckout(company.id)}
                    disabled={isPending}
                    className="bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    {isPending ? "Loading..." : "Subscribe Listing ($19.99/mo)"}
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
