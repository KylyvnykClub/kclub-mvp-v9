import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getReviewsForAdminAction } from "@/actions/reviews";
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
import { REVIEW_ADMIN_STATUSES } from "@/data/company-reviews";
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
import { Stars } from "@/components/reviews/stars";
import { ReviewModerationButtons } from "./_components/review-moderation-buttons";

const COLUMN_COUNT = 6;

const STATUS_TONES: Record<(typeof REVIEW_ADMIN_STATUSES)[number], StatusTone> =
  {
    pending: "warning",
    approved: "positive",
    rejected: "negative",
  };

/**
 * FR-129: the review moderation queue. Staff see who wrote each review; the
 * partner and every other member never do (ADR 0047).
 */
export default async function AdminReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.reviews");
  const tShell = await getTranslations("admin.shell");

  const current = await getCurrentMember();
  if (!current?.member) {
    redirect(`/${locale}/login`);
  }
  const actor = buildActor(current.member);
  if (!can(actor, "approve", "review") && !can(actor, "reject", "review")) {
    redirect(`/${locale}/dashboard`);
  }

  const { q, status, page } = await searchParams;
  const list = await getReviewsForAdminAction({ query: q, status, page });
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const pendingCount = list.statusCounts.pending;
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  });

  const basePath = `/${locale}/dashboard/admin/reviews`;
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
          pendingCount > 0 && (
            <Link href={`${basePath}?status=pending`}>
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
            options={REVIEW_ADMIN_STATUSES.map((value) => ({
              value,
              label: t(`status.${value}`),
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
              <TableHead>{t("colCompany")}</TableHead>
              <TableHead>{t("colReview")}</TableHead>
              <TableHead className="hidden lg:table-cell">
                {t("colAuthor")}
              </TableHead>
              <TableHead>{t("colStatus")}</TableHead>
              <TableHead className="text-right">{t("colActions")}</TableHead>
            </TableRow>
          </DataTableHeader>
          <TableBody>
            {list.rows.length === 0 ? (
              <DataTableEmpty colSpan={COLUMN_COUNT} message={t("empty")} />
            ) : (
              list.rows.map((review) => (
                <TableRow key={review.id}>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {dateFormatter.format(new Date(review.updatedAt))}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    <Link
                      href={`/${locale}/directory/${review.companySlug}#reviews`}
                      className="hover:underline"
                    >
                      {review.companyName}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-md space-y-1 text-sm">
                    <Stars rating={review.rating} size="size-3.5" />
                    <p className="whitespace-pre-wrap text-muted-foreground">
                      {review.body}
                    </p>
                  </TableCell>
                  <TableCell className="hidden text-sm lg:table-cell">
                    {review.authorName}
                    <span className="block font-mono text-xs text-muted-foreground">
                      {review.authorPhone}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      tone={STATUS_TONES[review.status]}
                      label={t(`status.${review.status}`)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <ReviewModerationButtons
                      reviewId={review.id}
                      status={review.status}
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
