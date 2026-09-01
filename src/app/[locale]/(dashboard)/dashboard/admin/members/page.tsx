import { getMembersListAction } from "@/actions/admin-members";
import { setRequestLocale, getTranslations } from "next-intl/server";
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
import { MEMBER_ADMIN_PLANS, MEMBER_ADMIN_STATUSES } from "@/data/members";
import { memberPlansOf } from "@/data/billing-access";
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
import {
  StatusBadge,
  memberPlanTone,
  memberStatusTone,
} from "../_components/status-badge";
import { MemberDetailSheet } from "./_components/member-detail-sheet";

const STATUS_LABEL_KEYS = {
  active: "statusActive",
  blocked: "statusBlocked",
  pending_deletion: "statusPendingDeletion",
} as const;

const PLAN_LABEL_KEYS = {
  vip: "planVip",
  business: "planBusiness",
  free: "planFree",
} as const;

const COLUMN_COUNT = 7;

export default async function AdminMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    status?: string;
    plan?: string;
    page?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.members");
  const tShell = await getTranslations("admin.shell");
  const tCard = await getTranslations("card");

  const session = await getCurrentMember();
  if (!session?.member) {
    redirect(`/${locale}/login`);
  }

  const actor = buildActor(session.member);
  if (!can(actor, "read", "member")) {
    redirect(`/${locale}/dashboard`);
  }
  const canManageMembers = can(actor, "block", "member");
  const canExportMembers = can(actor, "export_data", "member");

  const { q, status, plan, page } = await searchParams;
  const list = await getMembersListAction({ query: q, status, plan, page });
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  });

  const buildHref = (target: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (status) query.set("status", status);
    if (plan) query.set("plan", plan);
    if (target > 1) query.set("page", String(target));
    const search = query.toString();
    return search
      ? `/${locale}/dashboard/admin/members?${search}`
      : `/${locale}/dashboard/admin/members`;
  };

  return (
    <div className="w-full space-y-8">
      <PageHeader title={t("title")} description={t("description")} />

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
          <>
            <AdminFilterChips
              paramName="status"
              allLabel={tShell("filterAll")}
              options={MEMBER_ADMIN_STATUSES.map((value) => ({
                value,
                label: t(STATUS_LABEL_KEYS[value]),
                count: list.statusCounts[value],
              }))}
            />
            <AdminFilterChips
              paramName="plan"
              allLabel={tShell("filterAll")}
              options={MEMBER_ADMIN_PLANS.map((value) => ({
                value,
                label: t(PLAN_LABEL_KEYS[value]),
                count: list.planCounts[value],
              }))}
            />
          </>
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
              <TableHead>{t("colDisplayName")}</TableHead>
              <TableHead className="hidden sm:table-cell">
                {t("colPhone")}
              </TableHead>
              <TableHead className="hidden lg:table-cell">
                {t("colCards")}
              </TableHead>
              <TableHead>{t("colPlan")}</TableHead>
              <TableHead className="hidden md:table-cell">
                {t("colJoined")}
              </TableHead>
              <TableHead>{t("colStatus")}</TableHead>
              <TableHead className="text-right">{t("colActions")}</TableHead>
            </TableRow>
          </DataTableHeader>
          <TableBody>
            {list.rows.length === 0 ? (
              <DataTableEmpty colSpan={COLUMN_COUNT} message={t("noResults")} />
            ) : (
              list.rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <span className="block font-medium">
                      {m.displayName || t("notAvailable")}
                    </span>
                    {/* The phone column hides on phones, so the number rides
                        under the name there and disappears once it has its own
                        column. */}
                    <span className="block font-mono text-xs text-muted-foreground sm:hidden">
                      {m.phone}
                    </span>
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs sm:table-cell">
                    {m.phone}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {m.cards.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {m.cards.map((c) => (
                          <span
                            key={c.id}
                            className="flex items-center gap-2 text-xs"
                          >
                            <span className="font-mono">{c.serial}</span>
                            <StatusBadge
                              tone={
                                c.status === "valid" ? "positive" : "negative"
                              }
                              label={
                                c.status === "valid"
                                  ? tCard("statusValid")
                                  : tCard("statusRevoked")
                              }
                            />
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {t("noCards")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {/* A member can hold VIP and a listing at once, so this
                        renders every plan rather than picking a winner. */}
                    <div className="flex flex-wrap gap-1">
                      {memberPlansOf(m.subscriptions).map((memberPlan) => (
                        <StatusBadge
                          key={memberPlan}
                          tone={memberPlanTone(memberPlan)}
                          label={t(PLAN_LABEL_KEYS[memberPlan])}
                        />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {dateFormatter.format(new Date(m.createdAt))}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      tone={memberStatusTone(m.status)}
                      label={t(STATUS_LABEL_KEYS[m.status])}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <MemberDetailSheet
                      member={m}
                      canManage={canManageMembers}
                      canExport={canExportMembers}
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
