"use client";

import { useTransition } from "react";
import {
  createCheckoutSessionAction,
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

  const handleCheckout = () => {
    startTransition(async () => {
      const priceId =
        process.env.NEXT_PUBLIC_STRIPE_VIP_PRICE_ID || "price_dummy";
      try {
        await createCheckoutSessionAction(priceId);
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

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50 shadow-sm max-w-2xl">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl font-serif text-accent">
              Membership & Billing
            </CardTitle>
            <CardDescription className="mt-1">
              Manage your KYLYVNYK CLUB membership subscription.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={tier === "vip" ? "text-accent border-accent" : ""}
          >
            {tier.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {tier === "free" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You are currently on the Free tier. Upgrade to VIP to access
              exclusive features, discounts from our partners, and the ability
              to refer leads.
            </p>
            <Button
              onClick={handleCheckout}
              disabled={isPending}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {isPending ? "Loading..." : "Upgrade to VIP ($19.99/mo)"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You are an active VIP member. You can manage your payment methods,
              view invoices, or cancel your subscription via the Stripe billing
              portal.
            </p>
            <Button
              onClick={handlePortal}
              disabled={isPending}
              variant="outline"
            >
              {isPending ? "Loading..." : "Manage Subscription"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
