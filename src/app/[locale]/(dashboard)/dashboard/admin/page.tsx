import { setRequestLocale, getTranslations } from "next-intl/server";
import { getCurrentMember } from "@/actions/session";
import { redirect } from "next/navigation";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import { getAdminDashboardMetricsAction } from "@/actions/admin-dashboard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DollarSign, Clock, Users, Activity } from "lucide-react";
import { FinanceCountryChart } from "./_components/finance-country-chart";

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.dashboard");
  const session = await getCurrentMember();
  if (!session?.member) {
    redirect(`/${locale}/login`);
  }

  const actor = buildActor(session.member);
  if (!can(actor, "read", "finance_dashboard")) {
    redirect(`/${locale}/dashboard`);
  }

  const metrics = await getAdminDashboardMetricsAction();

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("description")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("revenue30d")}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.revenue30d.toLocaleString(locale, {
                style: "currency",
                currency: "USD",
              })}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("last30Days")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("activeVip")}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.activeVip}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("activeCompany")}
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.activeCompany}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("renewalsDue")}
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.renewalsDue}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("next7Days")}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>{t("recentPayments")}</CardTitle>
            <CardDescription>{t("recentPaymentsDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[400px] space-y-4 overflow-y-auto">
              {metrics.recentPayments.length === 0 ? (
                <div className="py-4 text-center text-muted-foreground">
                  {t("noPayments")}
                </div>
              ) : (
                metrics.recentPayments.slice(0, 50).map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between border-b pb-4 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium leading-none">
                        {payment.customer_email || t("unknownCustomer")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(payment.created * 1000).toLocaleDateString(
                          locale,
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="font-medium">
                        {(payment.amount / 100).toLocaleString(locale, {
                          style: "currency",
                          currency: payment.currency.toUpperCase(),
                        })}
                      </div>
                      {payment.receipt_url && (
                        <a
                          href={payment.receipt_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-accent hover:underline"
                        >
                          {t("viewReceipt")}
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>{t("revenueByCountry")}</CardTitle>
            <CardDescription>{t("revenueByCountryDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(metrics.revenueByCountry).length === 0 ? (
              <div className="py-4 text-center text-muted-foreground">
                {t("noData")}
              </div>
            ) : (
              <FinanceCountryChart
                revenueByCountry={metrics.revenueByCountry}
                locale={locale}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
