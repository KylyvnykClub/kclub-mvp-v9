import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getCurrentMember } from "@/actions/session";
import { db } from "@/data/db";
import { findProfileByMemberId } from "@/data/profiles";
import { listCompaniesByOwner } from "@/data/companies";
import { listSubscriptionsByMember } from "@/data/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditProfileForm } from "@/components/profile/edit-profile-form";
import { BillingSection } from "./_components/billing-section";
import { CompanyList } from "./_components/company-list";
import { CardQr } from "./_components/card-qr";

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

  const result = await getCurrentMember();
  if (!result || !result.member) {
    redirect(`/${locale}/login`);
  }

  const { member, card } = result;

  const profile = await findProfileByMemberId(db, member.id);

  const myCompanies = await listCompaniesByOwner(db, member.id);

  const mySubscriptions = await listSubscriptionsByMember(db, member.id);

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
    <div className="space-y-8 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
          {tDashboard("welcome", { name: member.displayName || "Member" })}
        </h1>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="companies">My Companies</TabsTrigger>
          <TabsTrigger value="edit">Edit Profile</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="grid gap-8 md:grid-cols-2">
            {/* Personal Info Card */}
            <Card className="bg-card/50 backdrop-blur-sm border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl font-serif text-accent">
                  {tDashboard("personalInfo")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      {tDashboard("name")}
                    </p>
                    <p className="font-medium">{member.displayName || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      {tDashboard("phone")}
                    </p>
                    <p className="font-medium font-mono tracking-wider">
                      {maskPhone(member.phone)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      {tDashboard("country")}
                    </p>
                    <p className="font-medium">{member.country || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      {tDashboard("language")}
                    </p>
                    <p className="font-medium uppercase">
                      {member.language || locale}
                    </p>
                  </div>
                  <div className="space-y-1 col-span-2 pt-4 border-t border-border/50">
                    <p className="text-sm text-muted-foreground">
                      {tDashboard("memberSince", { date: memberSince })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Virtual Card Visualization */}
            <div className="flex flex-col items-center justify-center p-2">
              <div
                className="w-full max-w-[400px] relative overflow-hidden rounded-2xl border border-accent/30 shadow-2xl transition-all duration-500 hover:shadow-accent/20 hover:border-accent/60 group"
                style={{
                  aspectRatio: "85.6/53.98",
                  background:
                    "linear-gradient(135deg, rgba(15,15,15,0.95) 0%, rgba(30,30,30,0.95) 100%)",
                  backdropFilter: "blur(20px)",
                }}
              >
                {/* Ambient glows */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-accent/20 rounded-full blur-3xl opacity-60 group-hover:bg-accent/40 transition-colors duration-700"></div>
                <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-accent/10 rounded-full blur-3xl opacity-60 group-hover:bg-accent/30 transition-colors duration-700"></div>

                {/* Card Content */}
                <div className="absolute inset-0 p-6 flex flex-col justify-between z-10">
                  {/* Top Row */}
                  <div className="flex justify-between items-start">
                    <div className="font-serif text-accent text-2xl font-bold tracking-widest drop-shadow-sm">
                      KCLUB
                    </div>
                    {card && (
                      <Badge
                        variant="outline"
                        className="bg-black/60 border-accent/60 text-accent uppercase tracking-widest text-[10px] font-bold px-2 py-0.5"
                      >
                        {card.tier === "vip"
                          ? tCard("tierVip")
                          : tCard("tierFree")}
                      </Badge>
                    )}
                  </div>

                  {/* Middle Row (Chip / QR) */}
                  <div className="flex items-center justify-between opacity-90 mt-2">
                    <svg
                      className="w-9 h-9 text-accent/80"
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

                  {/* Bottom Row */}
                  <div className="space-y-4">
                    <div className="font-mono text-xl tracking-[0.2em] text-foreground/95 drop-shadow-md">
                      {card?.serial || "XXXX-XXXX-XXXX"}
                    </div>
                    <div className="flex justify-between items-end">
                      <div className="space-y-1">
                        <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
                          {tDashboard("name")}
                        </div>
                        <div className="font-medium tracking-wider text-sm text-foreground/90 uppercase">
                          {member.displayName || "MEMBER"}
                        </div>
                      </div>

                      {card && (
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                card.status === "valid"
                                  ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                                  : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                              }`}
                            ></span>
                            <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
                              {card.status === "valid"
                                ? tCard("statusValid")
                                : tCard("statusRevoked")}
                            </span>
                          </div>
                          <div className="text-[10px] tracking-widest text-muted-foreground font-mono">
                            {cardIssuedAt}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Glass reflection */}
                <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none transform -skew-x-12 translate-x-full group-hover:translate-x-0"></div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="billing">
          <BillingSection tier={card?.tier || "free"} />
        </TabsContent>

        <TabsContent value="companies">
          <CompanyList
            companies={myCompanies}
            subscriptions={mySubscriptions}
          />
        </TabsContent>

        <TabsContent value="edit">
          <Card className="bg-card/50 backdrop-blur-sm border-border/50 shadow-sm max-w-2xl">
            <CardHeader>
              <CardTitle className="text-xl font-serif text-accent">
                Public Profile
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EditProfileForm profile={profile} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
