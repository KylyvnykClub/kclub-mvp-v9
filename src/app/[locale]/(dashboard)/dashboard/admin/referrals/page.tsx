import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getReferralsForAdminAction } from "@/actions/referral";
import { getCurrentMember } from "@/actions/session";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { REFERRAL_ADMIN_STATUSES } from "@/data/referrals";
import { AdminSearchInput } from "../_components/admin-search-input";
import { AdminFilterChips } from "../_components/admin-filter-chips";
import { AdminPagination } from "../_components/admin-pagination";
import { StatusBadge } from "../_components/status-badge";
import {
  ReferralDetailSheet,
  REFERRAL_STATUS_TONES,
} from "./_components/referral-detail-sheet";

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

  const buildHref = (target: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (status) query.set("status", status);
    if (target > 1) query.set("page", String(target));
    const search = query.toString();
    return search
      ? `/${locale}/dashboard/admin/referrals?${search}`
      : `/${locale}/dashboard/admin/referrals`;
  };

  return (
    <div className="w-full space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("description")}</p>
      </div>

      <div className="space-y-4 rounded-lg border border-border/50 bg-card/50 p-4 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <AdminSearchInput
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            submitLabel={t("search")}
          />
          <p className="text-xs font-medium text-muted-foreground">
            {t("totalCount", { count: list.total })}
          </p>
        </div>

        <AdminFilterChips
          paramName="status"
          allLabel={tShell("filterAll")}
          options={REFERRAL_ADMIN_STATUSES.map((value) => ({
            value,
            label: tr(`status.${value}`),
            count: list.statusCounts[value],
          }))}
        />

        <Table>
          <TableHeader>
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
              <TableHead>{t("colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-muted-foreground"
                >
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              // The client's name and contact channel are not columns here.
              // Moderation needs them, so they live one click away in the
              // drawer rather than across every row of a shared screen.
              list.rows.map((referral) => (
                <TableRow key={referral.id}>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {new Date(referral.createdAt).toLocaleDateString(locale)}
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
                  <TableCell>
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
        </Table>

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
      </div>
    </div>
  );
}
