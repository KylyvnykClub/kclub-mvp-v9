import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  Clock,
  DollarSign,
  Handshake,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { getCurrentMember } from "@/actions/session";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import {
  getAdminDashboardMetricsAction,
  type DashboardPeriodDays,
} from "@/actions/admin-dashboard";
import { getSupportMetricsAction } from "@/actions/admin-support";
import { getPendingCompaniesAction } from "@/actions/company";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PageHeader } from "./_components/page-header";
import { StatTile } from "./_components/stat-tile";
import { ConsoleSection } from "./_components/console-section";
import { RevenueChart } from "./_components/revenue-chart";
import { RegistrationsChart } from "./_components/registrations-chart";
import { FinanceCountryChart } from "./_components/finance-country-chart";
import { ModerateActions } from "./companies/_components/moderate-actions";

const PERIODS: DashboardPeriodDays[] = [7, 30, 90];
const RECENT_PAYMENT_ROWS = 10;

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
    <div className="inline-flex rounded-md border border-border bg-card p-0.5">
      {PERIODS.map((days) => (
        <Link
          key={days}
          href={`/${locale}/dashboard/admin?days=${days}`}
          aria-current={days === active ? "page" : undefined}
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

function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </h2>
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

  // `finance_dashboard` implies `moderation` (staff_admin ⊃ staff_support),
  // so the support metrics are readable by anyone who reached this page.
  const [metrics, support, pendingCompanies] = await Promise.all([
    getAdminDashboardMetricsAction(days),
    getSupportMetricsAction(),
    getPendingCompaniesAction(),
  ]);
  const queue = (pendingCompanies.data ?? []).slice(0, 5);
  const pendingTotal = support.pendingCompanies + support.pendingReferrals;

  const numberFormatter = new Intl.NumberFormat(locale);
  const currencyFormatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  });
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  });

  // The sparkline is already aligned to the registration buckets; zip them
  // back into dated points so the chart can label its axis.
  const revenueByDay = metrics.registrationsByDay.map((bucket, index) => ({
    date: bucket.date,
    amount: metrics.revenueSparkline[index] ?? 0,
  }));

  return (
    <div className="w-full space-y-8">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <PeriodSwitcher
            active={days}
            locale={locale}
            labels={{ 7: t("period7"), 30: t("period30"), 90: t("period90") }}
          />
        }
      />

      <section className="space-y-3">
        <SectionLabel>{t("sectionFinance")}</SectionLabel>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label={t("revenue")}
            value={currencyFormatter.format(metrics.revenue)}
            icon={DollarSign}
            footnote={t("lastNDays", { days })}
          />
          <StatTile
            label={t("activeVip")}
            value={numberFormatter.format(metrics.activeVip)}
            icon={Users}
          />
          <StatTile
            label={t("activeCompany")}
            value={numberFormatter.format(metrics.activeCompany)}
            icon={Activity}
          />
          <StatTile
            label={t("renewalsDue")}
            value={numberFormatter.format(metrics.renewalsDue)}
            icon={Clock}
            footnote={t("next7Days")}
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>{t("sectionCommunity")}</SectionLabel>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label={t("totalMembers")}
            value={numberFormatter.format(support.totalMembers)}
            icon={Users}
          />
          <StatTile
            label={t("activeMembers")}
            value={numberFormatter.format(support.activeMembers)}
            icon={UserCheck}
          />
          <StatTile
            label={t("newMembers")}
            value={numberFormatter.format(support.newMembers)}
            icon={UserPlus}
            footnote={t("last7Days")}
          />
          <StatTile
            label={t("awaitingReview")}
            value={numberFormatter.format(pendingTotal)}
            icon={Handshake}
            footnote={t("awaitingReviewDetail", {
              companies: support.pendingCompanies,
              referrals: support.pendingReferrals,
            })}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ConsoleSection
          title={t("revenueOverTime")}
          description={t("revenueOverTimeDesc")}
        >
          <RevenueChart
            data={revenueByDay}
            locale={locale}
            currency="USD"
            label={t("revenue")}
          />
        </ConsoleSection>

        <ConsoleSection
          title={t("registrationsTitle")}
          description={t("registrationsDesc")}
        >
          <RegistrationsChart
            data={metrics.registrationsByDay}
            locale={locale}
            membersLabel={t("membersSeriesLabel")}
            companiesLabel={t("companiesSeriesLabel")}
          />
        </ConsoleSection>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ConsoleSection
          title={t("revenueByCountry")}
          description={t("revenueByCountryDesc")}
        >
          <FinanceCountryChart
            revenueByCountry={metrics.revenueByCountry}
            locale={locale}
            mapLabels={{
              ariaLabel: t("revenueMapLabel"),
              selected: t("selectedCountry"),
              unknownCountry: t("unknownCountry"),
              noData: t("noData"),
            }}
          />
        </ConsoleSection>

        <ConsoleSection
          title={t("queueTitle")}
          action={
            <Link
              href={`/${locale}/dashboard/admin/companies?status=pending`}
              className="text-xs font-bold uppercase tracking-[0.08em] text-accent-ink hover:underline"
            >
              {t("viewAll")}
            </Link>
          }
        >
          {queue.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("queueEmpty")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {queue.map((company) => (
                <li
                  key={company.id}
                  className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {company.name}
                      </p>
                      {company.categories?.[0]?.businessCategory?.category && (
                        <Badge variant="outline" className="shrink-0">
                          {company.categories[0].businessCategory.category}
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {company.owner?.displayName}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <ModerateActions companyId={company.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ConsoleSection>
      </div>

      <ConsoleSection
        title={t("recentPayments")}
        description={t("recentPaymentsDesc")}
        contentClassName="p-0"
      >
        {metrics.recentPayments.length === 0 ? (
          <p className="px-5 pb-6 pt-2 text-center text-sm text-muted-foreground">
            {t("noPayments")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">{t("paymentCustomer")}</TableHead>
                <TableHead>{t("paymentDate")}</TableHead>
                <TableHead className="text-right">
                  {t("paymentAmount")}
                </TableHead>
                <TableHead className="pr-5 text-right">
                  {t("paymentReceipt")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.recentPayments
                .slice(0, RECENT_PAYMENT_ROWS)
                .map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="max-w-[16rem] truncate pl-5 font-medium">
                      {payment.customer_email || t("unknownCustomer")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dateFormatter.format(new Date(payment.created * 1000))}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {(payment.amount / 100).toLocaleString(locale, {
                        style: "currency",
                        currency: payment.currency.toUpperCase(),
                      })}
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      {payment.receipt_url && (
                        <a
                          href={payment.receipt_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold uppercase tracking-[0.08em] text-accent-ink hover:underline"
                        >
                          {t("viewReceipt")}
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </ConsoleSection>
    </div>
  );
}
