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
  if (!can(actor, "read", "audit_log")) {
    redirect(`/${locale}/dashboard`);
  }

  const metrics = await getAdminDashboardMetricsAction();

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-2">{t("description")}</p>
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
              $
              {metrics.revenue30d.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
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
            <p className="text-xs text-muted-foreground mt-1">
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
            <div className="space-y-4 max-h-[400px] overflow-y-auto">
              {metrics.recentPayments.length === 0 ? (
                <div className="text-center text-muted-foreground py-4">
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
            <div className="space-y-4">
              {Object.keys(metrics.revenueByCountry).length === 0 ? (
                <div className="text-center text-muted-foreground py-4">
                  {t("noData")}
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(metrics.revenueByCountry)
                    .sort(([, a], [, b]) => b - a)
                    .map(([country, amount]) => (
                      <div
                        key={country}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center space-x-2">
                          <span className="text-xl">
                            {country === "Unknown"
                              ? "🌍"
                              : `\uD83C${String.fromCharCode(country.charCodeAt(0) + 127397)}\uD83C${String.fromCharCode(country.charCodeAt(1) + 127397)}`}
                          </span>
                          <span className="font-medium">{country}</span>
                        </div>
                        <span className="text-muted-foreground">
                          {(amount / 100).toLocaleString(locale, {
                            style: "currency",
                            currency: "USD",
                          })}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
