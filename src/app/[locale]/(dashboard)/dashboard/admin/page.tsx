import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { getCurrentMember } from "@/actions/session";
import { redirect } from "next/navigation";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import {
  getAdminDashboardMetricsAction,
  type DashboardPeriodDays,
} from "@/actions/admin-dashboard";
import { getPendingCompaniesAction } from "@/actions/company";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Clock, Users, Activity } from "lucide-react";
import { FinanceCountryChart } from "./_components/finance-country-chart";
import { RegistrationsChart } from "./_components/registrations-chart";
import { KpiCard } from "./_components/kpi-card";
import { ModerateActions } from "./companies/_components/moderate-actions";
import { cn } from "@/lib/utils";

const PERIODS: DashboardPeriodDays[] = [7, 30, 90];

function PeriodSwitcher({
  active,
  locale,
  labels,
}: {
  active: DashboardPeriodDays;
  locale: string;
  labels: Record<DashboardPeriodDays, string>;
}) {
  return (
    <div className="inline-flex rounded-md border border-border p-0.5">
      {PERIODS.map((days) => (
        <Link
          key={days}
          href={`/${locale}/dashboard/admin?days=${days}`}
          className={cn(
            "rounded px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] transition-colors",
            days === active
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {labels[days]}
        </Link>
      ))}
    </div>
  );
}

export default async function AdminDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ days?: string }>;
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

  const { days: rawDays } = await searchParams;
  const days: DashboardPeriodDays = PERIODS.includes(
    Number(rawDays) as DashboardPeriodDays,
  )
    ? (Number(rawDays) as DashboardPeriodDays)
    : 30;

  const [metrics, pendingCompanies] = await Promise.all([
    getAdminDashboardMetricsAction(days),
    getPendingCompaniesAction(),
  ]);
  const queue = (pendingCompanies.data ?? []).slice(0, 5);

  const currencyFormatter = (value: number) =>
    value.toLocaleString(locale, { style: "currency", currency: "USD" });

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
            {t("title")}
          </h1>
          <p className="mt-2 text-muted-foreground">{t("description")}</p>
        </div>
        <PeriodSwitcher
          active={days}
          locale={locale}
          labels={{ 7: t("period7"), 30: t("period30"), 90: t("period90") }}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t("revenue")}
          value={currencyFormatter(metrics.revenue)}
          icon={DollarSign}
          footnote={t("lastNDays", { days })}
          sparklineValues={metrics.revenueSparkline}
        />
        <KpiCard
          label={t("activeVip")}
          value={String(metrics.activeVip)}
          icon={Users}
        />
        <KpiCard
          label={t("activeCompany")}
          value={String(metrics.activeCompany)}
          icon={Activity}
        />
        <KpiCard
          label={t("renewalsDue")}
          value={String(metrics.renewalsDue)}
          icon={Clock}
          footnote={t("next7Days")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("registrationsTitle")}</CardTitle>
            <CardDescription>{t("registrationsDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <RegistrationsChart
              data={metrics.registrationsByDay}
              locale={locale}
              membersLabel={t("membersSeriesLabel")}
              companiesLabel={t("companiesSeriesLabel")}
            />
          </CardContent>
        </Card>

        <Card>
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
                mapLabels={{
                  ariaLabel: t("revenueMapLabel"),
                  selected: t("selectedCountry"),
                  unknownCountry: t("unknownCountry"),
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
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
                          className="text-xs text-accent-ink hover:underline"
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t("queueTitle")}</CardTitle>
            </div>
            <Link
              href={`/${locale}/dashboard/admin/companies`}
              className="text-xs font-bold uppercase tracking-[0.08em] text-accent-ink hover:underline"
            >
              {t("viewAll")}
            </Link>
          </CardHeader>
          <CardContent>
            {queue.length === 0 ? (
              <div className="py-4 text-center text-muted-foreground">
                {t("queueEmpty")}
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {queue.map((company) => (
                  <div
                    key={company.id}
                    className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{company.name}</p>
                        <Badge
                          variant="outline"
                          className="shrink-0 bg-muted/50 text-[10px] uppercase text-muted-foreground"
                        >
                          {company.businessCategory?.category}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {company.owner?.displayName}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <ModerateActions companyId={company.id} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
