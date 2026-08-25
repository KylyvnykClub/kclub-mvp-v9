import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { getCurrentMember } from "@/actions/session";
import { db } from "@/data/db";
import { findProfileByMemberId } from "@/data/profiles";
import { listCompaniesByOwner } from "@/data/companies";
import {
  listActiveSubscriptionsForDeletion,
  listSubscriptionsByMember,
} from "@/data/billing";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditProfileForm } from "@/components/profile/edit-profile-form";
import { PersonalInfoForm } from "@/components/profile/personal-info-form";
import { PhoneChangeForm } from "@/components/profile/phone-change-form";
import { BillingSection } from "./_components/billing-section";
import { CompanyList } from "./_components/company-list";
import { CardQr } from "./_components/card-qr";
import { AccountDeletionForm } from "@/components/profile/account-deletion-form";
import { ActiveSessions } from "@/components/profile/active-sessions";

type Props = {
  params: Promise<{ locale: string }>;
};

function maskPhone(phone: string) {
  if (!phone) return "";
  return phone.slice(0, -4).replace(/./g, "*") + phone.slice(-4);
}

export default async function ProfilePage({ params }: Props) {
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

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-6 h-auto w-full justify-start overflow-x-auto rounded-none border border-border bg-muted/30 p-1">
          <TabsTrigger value="overview">
            {tDashboard("tabOverview")}
          </TabsTrigger>
          <TabsTrigger value="billing">{tDashboard("tabBilling")}</TabsTrigger>
          <TabsTrigger value="companies">
            {tDashboard("tabCompanies")}
          </TabsTrigger>
          <TabsTrigger value="settings">
            {tDashboard("tabSettings")}
          </TabsTrigger>
          <TabsTrigger value="edit">{tDashboard("tabEditProfile")}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="grid gap-px border border-border bg-border lg:grid-cols-[0.9fr_1.1fr]">
            <Card className="rounded-none border-0 bg-background shadow-none">
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

            <div className="dark flex flex-col items-center justify-center bg-zinc-950 p-6 sm:p-10">
              <div
                className="relative w-full max-w-[420px] overflow-hidden rounded-[20px] border border-accent/40"
                style={{
                  aspectRatio: "85.6/53.98",
                  background:
                    "linear-gradient(135deg, rgba(18,18,18,0.98) 0%, rgba(37,30,15,0.96) 100%)",
                }}
              >
                <div className="absolute inset-x-0 top-0 h-px bg-accent/70" />
                <div className="absolute inset-0 z-10 flex flex-col justify-between p-6">
                  <div className="flex items-start justify-between">
                    <div className="text-2xl font-black tracking-[0.18em] text-accent-ink">
                      KCLUB
                    </div>
                    {card && (
                      <Badge
                        variant="outline"
                        className="rounded-none border-accent/60 bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-accent-ink"
                      >
                        {card.tier === "vip"
                          ? tCard("tierVip")
                          : tCard("tierFree")}
                      </Badge>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between opacity-90">
                    <svg
                      className="h-9 w-9 text-accent-ink/80"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1"
                    >
                      <rect x="2" y="6" width="20" height="12" rx="2" />
                      <path d="M6 12h4m-4 0v4m4-4v4m4-4h4m-4 0v4" />
                    </svg>

                    {card && card.token && (
                      <CardQr token={card.token} locale={locale} />
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="font-mono text-xl tracking-[0.2em] text-white drop-shadow-md">
                      {card?.serial || "XXXX-XXXX-XXXX"}
                    </div>
                    <div className="flex items-end justify-between">
                      <div className="space-y-1">
                        <div className="text-[9px] uppercase tracking-[0.15em] text-white/45">
                          {tDashboard("name")}
                        </div>
                        <div className="text-sm font-medium uppercase tracking-wider text-white/90">
                          {member.displayName || tDashboard("memberFallback")}
                        </div>
                      </div>

                      {card && (
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                card.status === "valid"
                                  ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                                  : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                              }`}
                            ></span>
                            <span className="text-[9px] uppercase tracking-[0.15em] text-white/45">
                              {card.status === "valid"
                                ? tCard("statusValid")
                                : tCard("statusRevoked")}
                            </span>
                          </div>
                          <div className="font-mono text-[10px] tracking-widest text-white/45">
                            {cardIssuedAt}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="billing">
          <BillingSection tier={card?.tier || "free"} />
        </TabsContent>

        <TabsContent value="companies">
          <div className="mb-5 flex justify-start">
            <Button asChild className="rounded-none">
              <Link href="/dashboard/company/new">
                <Plus className="size-4" aria-hidden="true" />
                {tDashboard("navRegisterCompany")}
              </Link>
            </Button>
          </div>
          <CompanyList
            companies={myCompanies}
            subscriptions={mySubscriptions}
          />
        </TabsContent>

        <TabsContent value="settings">
          <div className="space-y-6">
            <Card className="max-w-2xl rounded-none border-border bg-background shadow-none">
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

            <Card className="max-w-2xl rounded-none border-border bg-background shadow-none">
              <CardHeader>
                <CardTitle className="text-xl font-black uppercase tracking-[-0.01em]">
                  {tDashboard("changePhoneTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PhoneChangeForm maskedPhone={maskPhone(member.phone)} />
              </CardContent>
            </Card>

            <Card className="max-w-2xl rounded-none border-border bg-background shadow-none">
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
            <Card className="max-w-2xl rounded-none border-border bg-background shadow-none">
              <CardHeader>
                <CardTitle className="text-xl font-black uppercase tracking-[-0.01em]">
                  {tDashboard("publicProfile")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <EditProfileForm profile={profile} />
              </CardContent>
            </Card>

            <Card className="max-w-2xl rounded-none border-border bg-background shadow-none">
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

            <Card className="max-w-2xl rounded-none border-destructive/40 bg-background shadow-none">
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
