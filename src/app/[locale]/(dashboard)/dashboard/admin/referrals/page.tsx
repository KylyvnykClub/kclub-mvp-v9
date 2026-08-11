import { setRequestLocale, getTranslations } from "next-intl/server";
import { getPendingReferralsAction } from "@/actions/referral";
import { AdminReferralsList } from "./_components/admin-referrals-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentMember } from "@/actions/session";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import { redirect } from "next/navigation";

export default async function AdminReferralsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");
  const tr = await getTranslations("Referral");

  const current = await getCurrentMember();
  if (!current?.member) {
    redirect("/dashboard");
  }

  const actor = buildActor(current.member);
  if (!can(actor, "approve", "referral") && !can(actor, "reject", "referral")) {
    redirect("/dashboard");
  }

  const pendingReferrals = await getPendingReferralsAction();

  const translations = {
    clientName: tr("clientName"),
    serviceNeeded: tr("serviceNeeded"),
    note: tr("note"),
    contactChannel: tr("contactChannel"),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold tracking-tight">
          {t("moderateReferrals")}
        </h1>
      </div>

      <Card className="rounded-none border-border/50 bg-background/50 backdrop-blur">
        <CardHeader>
          <CardTitle>{t("moderateReferrals")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminReferralsList
            referrals={pendingReferrals}
            translations={translations}
          />
        </CardContent>
      </Card>
    </div>
  );
}
