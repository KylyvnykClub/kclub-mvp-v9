import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { getCurrentMember } from "@/actions/session";
import { getMyInviteProgrammeAction } from "@/actions/invite-link";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import { db } from "@/data/db";
import { findProfileByMemberId } from "@/data/profiles";
import { maskEmail } from "@/lib/email";
import { env } from "@/env";
import { cardFace, type CardFace } from "@/domain/card-face";
import { holdIsCapturable } from "@/domain/listing-hold";
import { monthlyPrice } from "@/domain/pricing";
import { partnerStandingFor } from "@/modules/billing/listing-hold";
import { findAccessGrantingSubscription } from "@/data/billing";
import { listingStandingExtras } from "@/modules/catalogue/listing-standing";
import { checkoutPriceIsConfigured } from "@/modules/billing/prices";
import { companyListingIsPaid, listCompaniesByOwner } from "@/data/companies";
import { listNotificationsForMember } from "@/data/notifications";
import {
  listActiveSubscriptionsForDeletion,
  listSubscriptionsByMember,
} from "@/data/billing";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditProfileForm } from "@/components/profile/edit-profile-form";
import { PersonalInfoForm } from "@/components/profile/personal-info-form";
import { PhoneChangeForm } from "@/components/profile/phone-change-form";
import { EmailForm } from "@/components/profile/email-form";
import { BillingSection } from "./_components/billing-section";
import { CompanyList } from "./_components/company-list";
import { NotificationList } from "./_components/notification-list";
import { MembershipCard } from "./_components/membership-card";
import { InviteSection } from "./_components/invite-section";
import { AccountDeletionForm } from "@/components/profile/account-deletion-form";
import { ActiveSessions } from "@/components/profile/active-sessions";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; hold?: string }>;
};

const TABS = [
  "overview",
  "billing",
  "companies",
  "invite",
  "inbox",
  "settings",
  "edit",
];

const FACE_LABEL = {
  member: "tierFree",
  vip: "tierVip",
  business: "tierBusiness",
} as const satisfies Record<CardFace, string>;

function maskPhone(phone: string) {
  if (!phone) return "";
  return phone.slice(0, -4).replace(/./g, "*") + phone.slice(-4);
}

export default async function ProfilePage({ params, searchParams }: Props) {
  const { tab, hold } = await searchParams;
  const { locale } = await params;
  setRequestLocale(locale);

  const tDashboard = await getTranslations("dashboard");
  const tCard = await getTranslations("card");
  const tSessions = await getTranslations("sessions");

  const result = await getCurrentMember();
  if (!result || !result.member) {
    redirect(`/${locale}/login`);
  }

  const { member, card } = result;

  const profile = await findProfileByMemberId(db, member.id);

  const myCompanies = await listCompaniesByOwner(db, member.id);
  // Live exactly when the catalogue would show it: approved AND paid.
  const now = new Date();
  const liveCompanyIds = (
    await Promise.all(
      myCompanies.map(async (company) =>
        company.moderationStatus === "approved" &&
        (await companyListingIsPaid(db, company.id, now))
          ? company.id
          : null,
      ),
    )
  ).filter((id): id is string => id !== null);

  // Where each listing's payment stands: reserve, held, confirming, pay,
  // rejected (ADR 0037). The same rule the partner's standing screen reads.
  const payments = Object.fromEntries(
    await Promise.all(
      myCompanies.map(async (company) => {
        const { standing, holds } = await partnerStandingFor(db, company, now);
        const held = holds.find((h) => holdIsCapturable(h, now));
        return [
          company.id,
          {
            standing,
            holdExpiresAt: held?.captureBefore?.toISOString() ?? null,
            // ADR 0044: the ways out and the dates, beside the standing.
            extras: await listingStandingExtras(
              db,
              company,
              member,
              standing,
              now,
            ),
          },
        ] as const;
      }),
    ),
  );
  const listingSellable = await checkoutPriceIsConfigured(db, "listing");
  // ADR 0043: a member paying $4.99 is switched to VIP, and is told so.
  const payingDues = Boolean(
    await findAccessGrantingSubscription(db, member.id, "membership"),
  );

  const myNotifications = await listNotificationsForMember(db, member.id);

  // Staff accounts are not club memberships (ADR 0007) and bring nobody in.
  const invites = can(buildActor(member), "read", "own_invite_link");
  const inviteProgramme = invites ? await getMyInviteProgrammeAction() : null;

  const mySubscriptions = await listSubscriptionsByMember(db, member.id);
  const deletionSubscriptions = await listActiveSubscriptionsForDeletion(
    db,
    member.id,
  ).then((subscriptions) =>
    subscriptions.map((subscription) => ({
      id: subscription.id,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      company: subscription.company
        ? { name: subscription.company.name }
        : null,
    })),
  );

  const memberSince = member.createdAt
    ? new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(member.createdAt))
    : "";

  const face = cardFace({
    tier: card?.tier ?? "free",
    hasLiveCompany: liveCompanyIds.length > 0,
  });

  // A business partner's card opens their company page, so a client who scans
  // it lands on the business; every other card opens its verification page
  // (FR-022). With several live companies, the first one listed.
  const appUrl = env.client.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const liveCompany = myCompanies.find((c) => liveCompanyIds.includes(c.id));
  const cardQrUrl =
    face === "business" && liveCompany
      ? `${appUrl}/${locale}/directory/${liveCompany.slug}`
      : card?.token
        ? `${appUrl}/${locale}/card/${card.token}`
        : null;

  const cardIssuedAt = card?.issuedAt
    ? new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(card.issuedAt))
    : "";

  return (
    <div className="space-y-8">
      <div className="border-b border-border pb-6">
        <p className="kclub-eyebrow">{tDashboard("profile")}</p>
        <h1 className="mt-5 text-4xl font-black uppercase leading-tight tracking-[-0.03em] text-foreground sm:text-5xl">
          {tDashboard("welcome", {
            name: member.displayName || tDashboard("memberFallback"),
          })}
        </h1>
      </div>

      <Tabs
        // Remounted per ?tab= so a header link to a tab works from this page.
        key={tab ?? "overview"}
        defaultValue={tab && TABS.includes(tab) ? tab : "overview"}
        className="w-full"
      >
        <TabsList className="mb-6 grid h-auto w-full grid-cols-2 gap-1 border border-border bg-muted/30 p-1 sm:grid-cols-4 lg:grid-cols-7">
          <TabsTrigger value="overview">
            {tDashboard("tabOverview")}
          </TabsTrigger>
          <TabsTrigger value="billing">{tDashboard("tabBilling")}</TabsTrigger>
          <TabsTrigger value="companies">
            {tDashboard("tabCompanies")}
          </TabsTrigger>
          {invites && (
            <TabsTrigger value="invite">{tDashboard("tabInvite")}</TabsTrigger>
          )}
          <TabsTrigger value="inbox">{tDashboard("tabInbox")}</TabsTrigger>
          <TabsTrigger value="settings">
            {tDashboard("tabSettings")}
          </TabsTrigger>
          <TabsTrigger value="edit">{tDashboard("tabEditProfile")}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="grid gap-px border border-border bg-border lg:grid-cols-[0.9fr_1.1fr]">
            <Card className="border-0 bg-background shadow-none">
              <CardHeader className="border-b border-border">
                <CardTitle className="text-2xl font-black uppercase leading-tight tracking-[-0.02em] text-foreground">
                  {tDashboard("personalInfo")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid sm:grid-cols-2">
                  <div className="border-b border-border p-5 sm:border-r">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      {tDashboard("name")}
                    </p>
                    <p className="mt-2 text-base font-bold">
                      {member.displayName || "-"}
                    </p>
                  </div>
                  <div className="border-b border-border p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      {tDashboard("phone")}
                    </p>
                    <p className="mt-2 font-mono text-base font-bold tracking-wider">
                      {maskPhone(member.phone)}
                    </p>
                  </div>
                  <div className="border-b border-border p-5 sm:border-r sm:border-b-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      {tDashboard("country")}
                    </p>
                    <p className="mt-2 text-base font-bold">
                      {member.country || "-"}
                    </p>
                  </div>
                  <div className="border-b border-border p-5 sm:border-b-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      {tDashboard("language")}
                    </p>
                    <p className="mt-2 text-base font-bold uppercase">
                      {member.language || locale}
                    </p>
                  </div>
                  <div className="p-5 sm:col-span-2 sm:border-t sm:border-border">
                    <p className="text-sm font-light leading-6 text-muted-foreground">
                      {tDashboard("memberSince", { date: memberSince })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="dark flex flex-col items-center justify-center bg-zinc-950 px-3 py-6 sm:p-10">
              <MembershipCard
                face={face}
                holder={member.displayName || tDashboard("memberFallback")}
                membershipLabel={
                  // FR-021: the tier stays on the card - a VIP partner is both.
                  face === "business" && card?.tier === "vip"
                    ? `${tCard("tierBusiness")} · VIP`
                    : tCard(FACE_LABEL[face])
                }
                serial={card?.serial ?? "—"}
                qrUrl={cardQrUrl}
                valid={card?.status === "valid"}
                labels={{
                  holder: tCard("holder"),
                  membership: tCard("membershipType"),
                  serial: tCard("serial"),
                  status:
                    card?.status === "valid"
                      ? tCard("statusValid")
                      : tCard("statusRevoked"),
                }}
              />
              {cardIssuedAt && (
                <p className="mt-4 text-[10px] tracking-[0.15em] text-white/45 uppercase">
                  {tCard("issuedAt")} {cardIssuedAt}
                </p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="billing">
          <BillingSection
            tier={card?.tier || "free"}
            switching={payingDues}
            vipPrice={monthlyPrice("vip", locale)}
          />
        </TabsContent>

        <TabsContent value="companies">
          <div className="mb-5 flex justify-start">
            <Button asChild>
              <Link href="/dashboard/company/new">
                <Plus className="size-4" aria-hidden="true" />
                {tDashboard("navRegisterCompany")}
              </Link>
            </Button>
          </div>
          <CompanyList
            companies={myCompanies}
            subscriptions={mySubscriptions}
            liveCompanyIds={liveCompanyIds}
            appUrl={env.client.NEXT_PUBLIC_APP_URL}
            payments={payments}
            listingPrice={monthlyPrice("listing", locale)}
            sellable={listingSellable}
            returnedFromCheckout={hold === "returned"}
          />
        </TabsContent>

        {invites && (
          <TabsContent value="invite">
            <InviteSection
              programme={inviteProgramme}
              baseUrl={env.client.NEXT_PUBLIC_APP_URL}
              locale={locale}
            />
          </TabsContent>
        )}

        <TabsContent value="inbox">
          <NotificationList notifications={myNotifications} locale={locale} />
        </TabsContent>

        <TabsContent value="settings">
          <div className="space-y-6">
            <Card className="border-border bg-background shadow-none">
              <CardHeader>
                <CardTitle className="text-xl font-black uppercase tracking-[-0.01em]">
                  {tDashboard("personalInfo")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PersonalInfoForm
                  displayName={member.displayName}
                  language={member.language || locale}
                  country={member.country}
                />
              </CardContent>
            </Card>

            {/* The only way a mistyped address is corrected, and the only
                way an unverified one gets a second link (ADR 0032). Without
                this panel a typo at registration is unrecoverable by the
                member. */}
            <Card className="border-border bg-background shadow-none">
              <CardHeader>
                <CardTitle className="text-xl font-black uppercase tracking-[-0.01em]">
                  {tDashboard("emailTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <EmailForm
                  maskedEmail={member.email ? maskEmail(member.email) : null}
                  verified={member.emailVerifiedAt !== null}
                />
              </CardContent>
            </Card>

            <Card className="border-border bg-background shadow-none">
              <CardHeader>
                <CardTitle className="text-xl font-black uppercase tracking-[-0.01em]">
                  {tDashboard("changePhoneTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PhoneChangeForm maskedPhone={maskPhone(member.phone)} />
              </CardContent>
            </Card>

            <Card className="border-border bg-background shadow-none">
              <CardHeader>
                <CardTitle className="text-xl font-black uppercase tracking-[-0.01em]">
                  {tSessions("title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ActiveSessions locale={locale} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="edit">
          <div className="space-y-6">
            <Card className="border-border bg-background shadow-none">
              <CardHeader>
                <CardTitle className="text-xl font-black uppercase tracking-[-0.01em]">
                  {tDashboard("publicProfile")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <EditProfileForm profile={profile} />
              </CardContent>
            </Card>

            <Card className="border-border bg-background shadow-none">
              <CardHeader>
                <CardTitle className="text-xl font-black uppercase tracking-[-0.01em]">
                  {tDashboard("dataPrivacy")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-muted-foreground">
                  {tDashboard("dataPrivacyDesc")}
                </p>
                <a
                  href="/api/export/member"
                  download
                  className="inline-flex h-11 items-center justify-center bg-secondary px-5 py-2 text-xs font-bold uppercase tracking-[0.14em] text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  {tDashboard("exportData")}
                </a>
              </CardContent>
            </Card>

            <Card className="border-destructive/40 bg-background shadow-none">
              <CardHeader>
                <CardTitle className="text-xl font-black uppercase tracking-[-0.01em] text-destructive">
                  {tDashboard("deleteAccount")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AccountDeletionForm subscriptions={deletionSubscriptions} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
