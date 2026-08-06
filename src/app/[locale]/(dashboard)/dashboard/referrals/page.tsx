import { setRequestLocale, getTranslations } from "next-intl/server";
import {
  getSentReferralsAction,
  getReceivedReferralsAction,
} from "@/actions/referral";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SentReferralsList } from "./_components/sent-referrals-list";
import { ReceivedReferralsList } from "./_components/received-referrals-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ReferralsDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");
  const tr = await getTranslations("Referral");

  // A hacky way to pass translations as an object
  const translations = {
    clientName: tr("clientName"),
    serviceNeeded: tr("serviceNeeded"),
    note: tr("note"),
    status: {
      pending_review: tr("status.pending_review"),
      rejected: tr("status.rejected"),
      delivered: tr("status.delivered"),
      accepted: tr("status.accepted"),
      declined: tr("status.declined"),
      expired: tr("status.expired"),
    },
    accept: tr("accept"),
    decline: tr("decline"),
    contactChannel: tr("contactChannel"),
    contactRevealedAfterAccept: tr("contactRevealedAfterAccept"),
  };

  const sentReferrals = await getSentReferralsAction();
  const receivedReferrals = await getReceivedReferralsAction();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold tracking-tight">
          {t("referrals")}
        </h1>
      </div>

      <Tabs defaultValue="sent" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="sent">{t("sentReferrals")}</TabsTrigger>
          <TabsTrigger value="received">{t("receivedReferrals")}</TabsTrigger>
        </TabsList>

        <TabsContent value="sent" className="space-y-4">
          <Card className="rounded-none border-border/50 bg-background/50 backdrop-blur">
            <CardHeader>
              <CardTitle>{t("sentReferrals")}</CardTitle>
            </CardHeader>
            <CardContent>
              <SentReferralsList
                referrals={sentReferrals}
                translations={translations}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="received" className="space-y-4">
          <Card className="rounded-none border-border/50 bg-background/50 backdrop-blur">
            <CardHeader>
              <CardTitle>{t("receivedReferrals")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ReceivedReferralsList
                referrals={receivedReferrals}
                translations={translations}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
