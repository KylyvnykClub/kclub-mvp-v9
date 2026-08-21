import { getMembersListAction } from "@/actions/admin-members";
import { setRequestLocale, getTranslations } from "next-intl/server";
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
import { MEMBER_ADMIN_STATUSES } from "@/data/members";
import { AdminSearchInput } from "../_components/admin-search-input";
import { AdminFilterChips } from "../_components/admin-filter-chips";
import { AdminPagination } from "../_components/admin-pagination";
import { StatusBadge, memberStatusTone } from "../_components/status-badge";
import { MemberDetailSheet } from "./_components/member-detail-sheet";

const STATUS_LABEL_KEYS = {
  active: "statusActive",
  blocked: "statusBlocked",
  pending_deletion: "statusPendingDeletion",
} as const;

export default async function AdminMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
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

  const { q, status, page } = await searchParams;
  const list = await getMembersListAction({ query: q, status, page });
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));

  const buildHref = (target: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (status) query.set("status", status);
    if (target > 1) query.set("page", String(target));
    const search = query.toString();
    return search
      ? `/${locale}/dashboard/admin/members?${search}`
      : `/${locale}/dashboard/admin/members`;
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
            {t("totalCount", { count: list.total })}
          </p>
        </div>

        <AdminFilterChips
          paramName="status"
          allLabel={tShell("filterAll")}
          options={MEMBER_ADMIN_STATUSES.map((value) => ({
            value,
            label: t(STATUS_LABEL_KEYS[value]),
            count: list.statusCounts[value],
          }))}
        />

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colDisplayName")}</TableHead>
              <TableHead className="hidden sm:table-cell">
                {t("colPhone")}
              </TableHead>
              <TableHead className="hidden lg:table-cell">
                {t("colCards")}
              </TableHead>
              <TableHead className="hidden md:table-cell">
                {t("colJoined")}
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
                  {t("noResults")}
                </TableCell>
              </TableRow>
            ) : (
              list.rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    {m.displayName || t("notAvailable")}
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
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {new Date(m.createdAt).toLocaleDateString(locale)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      tone={memberStatusTone(m.status)}
                      label={t(STATUS_LABEL_KEYS[m.status])}
                    />
                  </TableCell>
                  <TableCell>
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
