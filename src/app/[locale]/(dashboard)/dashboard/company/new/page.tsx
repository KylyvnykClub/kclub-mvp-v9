import { setRequestLocale, getTranslations } from "next-intl/server";
import { getCurrentMember } from "@/actions/session";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyRegistrationForm } from "@/components/company/company-registration-form";
import { findUnspentPartnerInvitation } from "@/data/business-applications";
import { db } from "@/data/db";
import { monthlyPrice } from "@/domain/pricing";
import { clubPartnerLinkPending } from "@/modules/catalogue/partner-link-waiver";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function NewCompanyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("company");

  const result = await getCurrentMember();
  if (!result || !result.member) {
    redirect(`/${locale}/login`);
  }

  // ADR 0044: the terms this member's application is shown on; decided again
  // when it is filed.
  const [invited, waived] = await Promise.all([
    findUnspentPartnerInvitation(db, result.member.id).then(Boolean),
    clubPartnerLinkPending(db),
  ]);

  return (
    <div className="space-y-8 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
          {t("registerTitle")}
        </h1>
        <p className="text-muted-foreground mt-2">{t("registerSubtitle")}</p>
      </div>

      <Card className="bg-card/50 backdrop-blur-sm border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-serif text-accent-ink">
            {t("infoSection")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CompanyRegistrationForm
            terms={{
              invited,
              waived,
              residenceCountry: result.member.country ?? null,
              listingPrice: monthlyPrice("listing", locale),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
