import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { getCompaniesForAdminAction } from "@/actions/company";
import { getCurrentMember } from "@/actions/session";
import { redirect } from "next/navigation";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import {
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { COMPANY_ADMIN_STATUSES } from "@/data/companies";
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
import { StatusBadge, type StatusTone } from "../_components/status-badge";
import { CompanyDetailSheet } from "./_components/company-detail-sheet";

const STATUS_LABEL_KEYS = {
  pending: "statusPending",
  approved: "statusApproved",
  rejected: "statusRejected",
} as const;

const STATUS_TONES: Record<keyof typeof STATUS_LABEL_KEYS, StatusTone> = {
  pending: "warning",
  approved: "positive",
  rejected: "negative",
};

const COLUMN_COUNT = 7;

export default async function AdminCompaniesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.companies");
  const tShell = await getTranslations("admin.shell");

  const auth = await getCurrentMember();
  if (!auth?.member) {
    redirect(`/${locale}/login`);
  }
  const actor = buildActor(auth.member);
  if (!can(actor, "read", "company")) {
    redirect(`/${locale}/dashboard`);
  }
  const canModerate =
    can(actor, "approve", "company") || can(actor, "reject", "company");

  const { q, status, page } = await searchParams;
  const { data } = await getCompaniesForAdminAction({
    query: q,
    status,
    page,
  });
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  });

  const basePath = `/${locale}/dashboard/admin/companies`;
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
          // Same number the sidebar badge shows; the link lands on the queue
          // already filtered, so the badge and the rows are the same set.
          data.statusCounts.pending > 0 && (
            <Link href={`${basePath}?status=pending`}>
              <Badge variant="warning">
                {t("pendingBadge", { count: data.statusCounts.pending })}
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
        summary={t("totalCount", { count: data.total })}
        filters={
          <AdminFilterChips
            paramName="status"
            allLabel={tShell("filterAll")}
            options={COMPANY_ADMIN_STATUSES.map((value) => ({
              value,
              label: t(STATUS_LABEL_KEYS[value]),
              count: data.statusCounts[value],
            }))}
          />
        }
        footer={
          <AdminPagination
            page={data.page}
            totalPages={totalPages}
            buildHref={buildHref}
            labels={{
              previous: tShell("previous"),
              next: tShell("next"),
              summary: tShell("pageSummary", {
                page: data.page,
                totalPages,
                total: data.total,
              }),
            }}
          />
        }
      >
        <DataTable>
          <DataTableHeader>
            <TableRow>
              <TableHead>{t("colCompany")}</TableHead>
              <TableHead className="hidden sm:table-cell">
                {t("colOwner")}
              </TableHead>
              {/*
                Category and submission date are the first to go when the
                viewport narrows: identity, status and the action are what a
                moderator needs, and keeping six columns on a phone turned every
                row into a three-line block with a horizontal scrollbar.
              */}
              <TableHead className="hidden lg:table-cell">
                {t("colCategory")}
              </TableHead>
              <TableHead className="hidden md:table-cell">
                {t("colSubmitted")}
              </TableHead>
              <TableHead>{t("colStatus")}</TableHead>
              <TableHead className="hidden sm:table-cell">
                {t("colListing")}
              </TableHead>
              <TableHead className="text-right">{t("colActions")}</TableHead>
            </TableRow>
          </DataTableHeader>
          <TableBody>
            {data.rows.length === 0 ? (
              <DataTableEmpty colSpan={COLUMN_COUNT} message={t("empty")} />
            ) : (
              data.rows.map((company) => {
                const isPending = company.moderationStatus === "pending";
                return (
                  <TableRow key={company.id}>
                    <TableCell>
                      <span className="block font-medium">{company.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {company.slug}
                      </span>
                      {company.discount && (
                        <span className="hidden text-xs text-accent-ink sm:block">
                          {company.discount}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {company.owner?.displayName}
                    </TableCell>
                    <TableCell className="hidden max-w-[14rem] truncate text-xs text-muted-foreground lg:table-cell">
                      {company.categories
                        ?.map((c) =>
                          [
                            c.businessCategory?.block,
                            c.businessCategory?.category,
                          ]
                            .filter(Boolean)
                            .join(" / "),
                        )
                        .join(" · ") || "—"}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {dateFormatter.format(new Date(company.createdAt))}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={STATUS_TONES[company.moderationStatus]}
                        label={t(STATUS_LABEL_KEYS[company.moderationStatus])}
                      />
                    </TableCell>
                    {/*
                      Payment now precedes moderation (ADR 0019), so an unpaid
                      row is an abandoned checkout rather than an error. Paid
                      rows sort first; this tells the moderator which is which.
                    */}
                    <TableCell className="hidden sm:table-cell">
                      <StatusBadge
                        tone={company.paid ? "positive" : "warning"}
                        label={
                          company.paid ? t("listingPaid") : t("listingUnpaid")
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Approve/reject live inside the sheet's moderation
                          tab, so the decision is made with the profile open. */}
                      <CompanyDetailSheet
                        companyId={company.id}
                        companyName={company.name}
                        canModerate={canModerate}
                        triggerLabel={
                          canModerate && isPending ? t("review") : undefined
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </DataTable>
      </DataTableShell>
    </div>
  );
}
