import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getReferralsForAdminAction } from "@/actions/referral";
import { getCurrentMember } from "@/actions/session";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import {
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { REFERRAL_ADMIN_STATUSES } from "@/data/referrals";
import { PageHeader } from "../_components/page-header";
import {
  DataTable,
  DataTableEmpty,
  DataTableHeader,
  DataTableShell,
} from "../_components/data-table";
import { AdminSearchInput } from "../_components/admin-search-input";
import { AdminFilterChips } from "../_components/admin-filter-chips";
import { AdminPagination } from "../_components/admin-pagination";
import { StatusBadge } from "../_components/status-badge";
import {
  ReferralDetailSheet,
  REFERRAL_STATUS_TONES,
} from "./_components/referral-detail-sheet";

const COLUMN_COUNT = 6;

export default async function AdminReferralsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.referrals");
  const tr = await getTranslations("Referral");
  const tShell = await getTranslations("admin.shell");

  const current = await getCurrentMember();
  if (!current?.member) {
    redirect(`/${locale}/login`);
  }

  const actor = buildActor(current.member);
  const canApprove = can(actor, "approve", "referral");
  const canReject = can(actor, "reject", "referral");
  if (!canApprove && !canReject) {
    redirect(`/${locale}/dashboard`);
  }

  const { q, status, page } = await searchParams;
  const list = await getReferralsForAdminAction({ query: q, status, page });
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const pendingCount = list.statusCounts.pending_review;
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  });

  const basePath = `/${locale}/dashboard/admin/referrals`;
  const buildHref = (target: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (status) query.set("status", status);
    if (target > 1) query.set("page", String(target));
    const search = query.toString();
    return search ? `${basePath}?${search}` : basePath;
  };

  return (
    <div className="w-full space-y-8">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          // The same count the sidebar badge shows, landing on the queue
          // already filtered so the badge and the rows are one set.
          pendingCount > 0 && (
            <Link href={`${basePath}?status=pending_review`}>
              <Badge variant="warning">
                {t("pendingBadge", { count: pendingCount })}
              </Badge>
            </Link>
          )
        }
      />

      <DataTableShell
        toolbar={
          <AdminSearchInput
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            submitLabel={t("search")}
          />
        }
        summary={t("totalCount", { count: list.total })}
        filters={
          <AdminFilterChips
            paramName="status"
            allLabel={tShell("filterAll")}
            options={REFERRAL_ADMIN_STATUSES.map((value) => ({
              value,
              label: tr(`status.${value}`),
              count: list.statusCounts[value],
            }))}
          />
        }
        footer={
          <AdminPagination
            page={list.page}
            totalPages={totalPages}
            buildHref={buildHref}
            labels={{
              previous: tShell("previous"),
              next: tShell("next"),
              summary: tShell("pageSummary", {
                page: list.page,
                totalPages,
                total: list.total,
              }),
            }}
          />
        }
      >
        <DataTable>
          <DataTableHeader>
            <TableRow>
              <TableHead className="hidden md:table-cell">
                {t("colDate")}
              </TableHead>
              <TableHead>{t("colFrom")}</TableHead>
              <TableHead>{t("colTo")}</TableHead>
              <TableHead className="hidden lg:table-cell">
                {t("colService")}
              </TableHead>
              <TableHead>{t("colStatus")}</TableHead>
              <TableHead className="text-right">{t("colActions")}</TableHead>
            </TableRow>
          </DataTableHeader>
          <TableBody>
            {list.rows.length === 0 ? (
              <DataTableEmpty colSpan={COLUMN_COUNT} message={t("empty")} />
            ) : (
              // The client's name and contact channel are not columns here.
              // Moderation needs them, so they live one click away in the
              // sheet rather than across every row of a shared screen.
              list.rows.map((referral) => (
                <TableRow key={referral.id}>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {dateFormatter.format(new Date(referral.createdAt))}
                  </TableCell>
                  <TableCell className="text-sm">
                    {referral.sender?.displayName ?? tr("unknown")}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {referral.recipientCompany?.name ?? tr("unknown")}
                  </TableCell>
                  <TableCell className="hidden max-w-xs truncate text-sm text-muted-foreground lg:table-cell">
                    {referral.serviceNeeded}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      tone={REFERRAL_STATUS_TONES[referral.status]}
                      label={tr(`status.${referral.status}`)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <ReferralDetailSheet
                      referral={referral}
                      canApprove={canApprove}
                      canReject={canReject}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </DataTable>
      </DataTableShell>
    </div>
  );
}
