import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getCurrentMember } from "@/actions/session";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { checkoutPriceIsConfigured } from "@/modules/billing/prices";
import {
  awaitsPaymentOutsideClub,
  listOwnApplications,
} from "@/data/membership-access";
import { SignOutButton } from "./_components/sign-out-button";
import { DuesPaymentChoice } from "./_components/dues-payment-choice";
import { PartnerStanding } from "./_components/partner-standing";
import { db } from "@/data/db";
import { applicationIsLive, holdIsCapturable } from "@/domain/listing-hold";
import { partnerStandingFor } from "@/modules/billing/listing-hold";
import { listingStandingExtras } from "@/modules/catalogue/listing-standing";
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
 *
 * A business partner reaches the same URL and a different screen (FR-110). They
 * owe no dues; what holds them outside is the listing, whose price is reserved
 * on their card while the application is reviewed and charged on approval
 * (ADR 0037). So the gate is one gate, and what it shows depends on which kind
 * of member is standing at it.
 */
export default async function MembershipDuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ hold?: string; company?: string; plan?: string }>;
}) {
  const { locale } = await params;
  const { hold, company: returnedCompany, plan } = await searchParams;
  // Which plan the member picked before registering. It orders the two
  // buttons and nothing more: both are always offered (ADR 0043).
  const vipFirst = plan === "vip";
  // Back from Stripe for one company: only its card says "confirming".
  const returnedFor = (companyId: string) =>
    hold === "returned" &&
    (returnedCompany === undefined || returnedCompany === companyId);
  setRequestLocale(locale);

  const current = await getCurrentMember();
  if (!current?.member) {
    redirect(`/${locale}/login`);
  }

  // The same rule as every other gate, staff exemption included (ADR 0007):
  // anyone inside the club is sent in, so this screen never asks them to pay.
  const now = new Date();
  if (!(await awaitsPaymentOutsideClub(db, current.member, now))) {
    redirect(`/${locale}/dashboard/profile`);
  }

  const t = await getTranslations({ locale, namespace: "membership" });

  if (current.member.duesKind === "partner") {
    const tPartner = await getTranslations({
      locale,
      namespace: "partnerStanding",
    });
    const listingPrice = monthlyPrice("listing", locale);
    const application = currentApplication(
      await listOwnApplications(db, current.member.id),
    );
    const { standing, holds } = application
      ? await partnerStandingFor(db, application, now)
      : { standing: null, holds: [] };
    const extras =
      application && standing
        ? await listingStandingExtras(
            db,
            application,
            current.member,
            standing,
            now,
          )
        : null;
    const heldUntil =
      holds.find((h) => holdIsCapturable(h, now))?.captureBefore ?? null;

    return (
      <AuthShell
        eyebrow="KYLYVNYK CLUB PARTNERS"
        title={tPartner("title")}
        subtitle={tPartner("subtitle")}
      >
        <Card className="w-full border-white/10 bg-background text-foreground shadow-none">
          <CardContent className="space-y-5 p-6 sm:p-8">
            <PartnerStanding
              application={
                application
                  ? {
                      id: application.id,
                      name: application.name,
                      rejectionReason: application.rejectionReason,
                    }
                  : null
              }
              standing={standing}
              holdExpiresAt={heldUntil ? heldUntil.toISOString() : null}
              price={listingPrice}
              sellable={await checkoutPriceIsConfigured(db, "listing")}
              returnedFromCheckout={
                application ? returnedFor(application.id) : false
              }
              extras={extras}
            />
          </CardContent>
          <CardFooter className="justify-between border-t border-border p-6 sm:p-8">
            <Link
              href={`/${locale}/pricing`}
              className="text-sm font-bold uppercase tracking-[0.12em] text-foreground hover:text-accent-ink"
            >
              {t("pricingLink")}
            </Link>
            <SignOutButton />
          </CardFooter>
        </Card>
      </AuthShell>
    );
  }

  const price = monthlyPrice("membership", locale);
  const vipPrice = monthlyPrice("vip", locale);

  // No price configured means Stripe cannot be opened at all. The member is
  // told plainly and the button is not offered, rather than being handed a
  // button that throws on the one screen they are allowed to see.
  const [sellable, vipSellable, owned, listingSellable, tPartner] =
    await Promise.all([
      checkoutPriceIsConfigured(db, "membership"),
      checkoutPriceIsConfigured(db, "vip"),
      listOwnApplications(db, current.member.id),
      checkoutPriceIsConfigured(db, "listing"),
      getTranslations({ locale, namespace: "partnerStanding" }),
    ]);

  // A member whose dues are unpaid may still have filed companies (from
  // /partner, since the dashboard is closed to them). Each listing is its own
  // payment (ADR 0037), so every live application's standing - and its hold
  // button - sits here too, next to the dues and separate from them. With no
  // live one, the latest refusal is shown, with the way to apply again.
  const live = owned.filter((company) =>
    applicationIsLive(company.moderationStatus),
  );
  const shownCompanies = live.length > 0 ? live : owned.slice(-1);
  const hasLiveApplication = live.length > 0;
  const standings =
    shownCompanies.length > 0
      ? await Promise.all(
          shownCompanies.map(async (company) => {
            const { standing, holds } = await partnerStandingFor(
              db,
              company,
              now,
            );
            const heldUntil =
              holds.find((h) => holdIsCapturable(h, now))?.captureBefore ??
              null;
            const extras = await listingStandingExtras(
              db,
              company,
              current.member,
              standing,
              now,
            );
            return { company, standing, heldUntil, extras };
          }),
        )
      : [];

  return (
    <AuthShell
      eyebrow="KYLYVNYK CLUB MEMBERSHIP"
      title={t("duesTitle")}
      subtitle={
        vipFirst
          ? t("duesSubtitleVip", { vipPrice })
          : t("duesSubtitle", { price })
      }
    >
      {standings.map(({ company, standing, heldUntil, extras }) => (
        <Card
          key={company.id}
          className="mb-6 w-full border-white/10 bg-background text-foreground shadow-none"
        >
          <CardHeader className="space-y-2 border-b border-border p-6 sm:p-8">
            <CardTitle className="text-xl font-black uppercase leading-none tracking-[-0.02em] text-foreground">
              {tPartner("title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 p-6 sm:p-8">
            <PartnerStanding
              application={{
                id: company.id,
                name: company.name,
                rejectionReason: company.rejectionReason,
              }}
              standing={standing}
              holdExpiresAt={heldUntil ? heldUntil.toISOString() : null}
              price={monthlyPrice("listing", locale)}
              sellable={listingSellable}
              returnedFromCheckout={returnedFor(company.id)}
              extras={extras}
            />
          </CardContent>
        </Card>
      ))}
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
          {/* VIP includes membership (ADR 0043), so it is the other way in,
              offered beside the dues rather than after them. */}
          <p className="border-t border-border pt-5 text-sm font-light leading-6 text-muted-foreground">
            {t("vipNote", { vipPrice })}
          </p>
          <p className="text-sm font-light leading-6 text-muted-foreground">
            {t("sponsoredNote")}
          </p>
          {!hasLiveApplication && (
            <p className="text-sm font-light leading-6 text-muted-foreground">
              {t("businessNote", {
                listingPrice: monthlyPrice("listing", locale),
              })}{" "}
              <Link
                href={`/${locale}/partner`}
                className="font-bold text-foreground underline hover:text-accent-ink"
              >
                {t("businessLink")}
              </Link>
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col space-y-4 p-6 pt-0 sm:p-8 sm:pt-0">
          {/* The redirect back from Stripe grants nothing: access appears when
              the subscription is projected from Stripe's own event (FR-104). */}
          {sellable || vipSellable ? (
            <DuesPaymentChoice
              price={price}
              vipPrice={vipPrice}
              sellable={sellable}
              vipSellable={vipSellable}
              vipFirst={vipFirst}
            />
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

/**
 * The application a partner's standing screen is about: the latest live one
 * (pending or approved), or else the latest refusal. The oldest row used to be
 * shown, which after a refusal and a new application would have been the
 * refusal.
 */
function currentApplication<T extends { moderationStatus: string }>(
  companies: readonly T[],
): T | undefined {
  const live = companies.filter((c) => applicationIsLive(c.moderationStatus));
  return live.at(-1) ?? companies.at(-1);
}
