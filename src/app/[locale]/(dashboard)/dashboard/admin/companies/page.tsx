import { setRequestLocale, getTranslations } from "next-intl/server";
import { getCompaniesForAdminAction } from "@/actions/company";
import { getCurrentMember } from "@/actions/session";
import { redirect } from "next/navigation";
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
import { COMPANY_ADMIN_STATUSES } from "@/data/companies";
import { AdminSearchInput } from "../_components/admin-search-input";
import { AdminFilterChips } from "../_components/admin-filter-chips";
import { AdminPagination } from "../_components/admin-pagination";
import { StatusBadge, type StatusTone } from "../_components/status-badge";
import { ModerateActions } from "./_components/moderate-actions";
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

  const buildHref = (target: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (status) query.set("status", status);
    if (target > 1) query.set("page", String(target));
    const search = query.toString();
    return search
      ? `/${locale}/dashboard/admin/companies?${search}`
      : `/${locale}/dashboard/admin/companies`;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8">
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
            {t("totalCount", { count: data.total })}
          </p>
        </div>

        <AdminFilterChips
          paramName="status"
          allLabel={tShell("filterAll")}
          options={COMPANY_ADMIN_STATUSES.map((value) => ({
            value,
            label: t(STATUS_LABEL_KEYS[value]),
            count: data.statusCounts[value],
          }))}
        />

        <Table>
          <TableHeader>
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
              <TableHead>{t("colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-muted-foreground"
                >
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              data.rows.map((company) => (
                <TableRow key={company.id}>
                  <TableCell>
                    <span className="font-medium">{company.name}</span>
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
                    {[
                      company.businessCategory?.block,
                      company.businessCategory?.category,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {new Date(company.createdAt).toLocaleDateString(locale)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      tone={STATUS_TONES[company.moderationStatus]}
                      label={t(STATUS_LABEL_KEYS[company.moderationStatus])}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <CompanyDetailSheet
                        companyId={company.id}
                        companyName={company.name}
                        canModerate={canModerate}
                      />
                      {canModerate &&
                        company.moderationStatus === "pending" && (
                          <ModerateActions companyId={company.id} />
                        )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

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
      </div>
    </div>
  );
}
