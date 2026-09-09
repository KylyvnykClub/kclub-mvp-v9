import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getCurrentMember } from "@/actions/session";
import { createMembershipCheckoutAction } from "@/actions/stripe";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { checkoutPriceIsConfigured } from "@/modules/billing/prices";
import { listMemberSubscriptionPlans } from "@/data/billing";
import { SignOutButton } from "./_components/sign-out-button";
import { db } from "@/data/db";
import { membershipAccess } from "@/domain/membership";
import { monthlyPrice } from "@/domain/pricing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "membership" });

  return { title: t("duesTitle"), robots: { index: false, follow: false } };
}

/**
 * The one screen a member reaches while their dues are unpaid (FR-103).
 *
 * It lives outside `(dashboard)` on purpose: the gate that sends people here is
 * in the dashboard layout, and a screen inside that layout would redirect to
 * itself. It is also the honest shape — somebody who has not paid is not inside
 * the club yet, so they do not get the club's chrome.
 *
 * A member who *has* access is sent away again, so the screen cannot be used to
 * pay twice.
 */
export default async function MembershipDuesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const current = await getCurrentMember();
  if (!current?.member) {
    redirect(`/${locale}/login`);
  }

  const subscriptions = await listMemberSubscriptionPlans(
    db,
    current.member.id,
  );
  if (membershipAccess(current.member, subscriptions) === "active") {
    redirect(`/${locale}/dashboard/profile`);
  }

  const t = await getTranslations({ locale, namespace: "membership" });
  const price = monthlyPrice("membership", locale);

  // No price configured means Stripe cannot be opened at all. The member is
  // told plainly and the button is not offered, rather than being handed a
  // button that throws on the one screen they are allowed to see.
  const sellable = await checkoutPriceIsConfigured(db, "membership");

  return (
    <AuthShell
      eyebrow="KCLUB MEMBERSHIP"
      title={t("duesTitle")}
      subtitle={t("duesSubtitle", { price })}
    >
      <Card className="w-full border-white/10 bg-background text-foreground shadow-none">
        <CardHeader className="space-y-3 border-b border-border p-6 sm:p-8">
          <CardTitle className="text-3xl font-black uppercase leading-none tracking-[-0.02em] text-foreground">
            {t("duesPrice", { price })}
          </CardTitle>
          <CardDescription className="text-sm font-light leading-6 text-muted-foreground">
            {t("cancelAnytime")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
            {t("includesTitle")}
          </p>
          <ul className="space-y-3 text-sm leading-6 text-foreground">
            <li>{t("include1")}</li>
            <li>{t("include2")}</li>
            <li>{t("include3")}</li>
          </ul>
          <p className="border-t border-border pt-5 text-sm font-light leading-6 text-muted-foreground">
            {t("sponsoredNote")}
          </p>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4 p-6 pt-0 sm:p-8 sm:pt-0">
          {/* The redirect back from Stripe grants nothing: access appears when
              the subscription is projected from Stripe's own event (FR-104). */}
          {sellable ? (
            <form action={createMembershipCheckoutAction} className="w-full">
              <Button
                type="submit"
                className="h-12 w-full bg-accent text-xs font-black uppercase tracking-[0.16em] text-accent-foreground hover:bg-[#b49126]"
              >
                {t("payButton", { price })}
              </Button>
            </form>
          ) : (
            <p
              role="alert"
              className="w-full border border-destructive/30 bg-destructive/10 p-3 text-center text-sm font-medium text-destructive"
            >
              {t("unavailable")}
            </p>
          )}
          <div className="flex w-full items-center justify-between text-sm text-muted-foreground">
            <Link
              href={`/${locale}/pricing`}
              className="font-bold uppercase tracking-[0.12em] text-foreground hover:text-accent-ink"
            >
              {t("pricingLink")}
            </Link>
            <SignOutButton />
          </div>
        </CardFooter>
      </Card>
    </AuthShell>
  );
}
