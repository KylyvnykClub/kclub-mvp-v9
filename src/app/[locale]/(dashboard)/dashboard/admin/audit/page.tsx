import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { getCurrentMember } from "@/actions/session";
import { redirect } from "next/navigation";
import { AlertTriangle, Search } from "lucide-react";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import { getAuditLogsAction } from "@/actions/admin-audit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "../_components/page-header";
import {
  DataTable,
  DataTableEmpty,
  DataTableHeader,
  DataTableShell,
} from "../_components/data-table";

const COLUMN_COUNT = 5;

type AuditFilters = {
  q?: string;
  actor?: string;
  target?: string;
  dateFrom?: string;
  dateTo?: string;
};

export default async function AdminAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<AuditFilters>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.audit");
  const tCommon = await getTranslations("common");
  const session = await getCurrentMember();
  if (!session?.member) {
    redirect(`/${locale}/login`);
  }

  const actor = buildActor(session.member);
  if (!can(actor, "read", "audit_log")) {
    redirect(`/${locale}/dashboard`);
  }

  const filters = await searchParams;
  const basePath = `/${locale}/dashboard/admin/audit`;
  const activeQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) activeQuery.set(key, value);
  }
  const hasFilters = activeQuery.size > 0;
  const currentHref = hasFilters
    ? `${basePath}?${activeQuery.toString()}`
    : basePath;

  // The audit log is the one screen that must still render when the database
  // misbehaves - an owner investigating an incident needs the error, not a
  // blank page. Authorisation failed above, so what is left here is I/O.
  let logs: Awaited<ReturnType<typeof getAuditLogsAction>> | null = null;
  try {
    logs = await getAuditLogsAction(filters);
  } catch {
    logs = null;
  }

  const dateTimeFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const filterForm = (
    <form className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_9.5rem_9.5rem_auto]">
      <Input
        name="q"
        type="search"
        defaultValue={filters.q}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchPlaceholder")}
      />
      <Input
        name="actor"
        defaultValue={filters.actor}
        placeholder={t("actorPlaceholder")}
        aria-label={t("actorPlaceholder")}
        className="font-mono text-xs"
      />
      <Input
        name="target"
        defaultValue={filters.target}
        placeholder={t("targetPlaceholder")}
        aria-label={t("targetPlaceholder")}
        className="font-mono text-xs"
      />
      <Input
        name="dateFrom"
        type="date"
        defaultValue={filters.dateFrom}
        aria-label={t("dateFrom")}
      />
      <Input
        name="dateTo"
        type="date"
        defaultValue={filters.dateTo}
        aria-label={t("dateTo")}
      />
      <div className="flex gap-2">
        <Button
          type="submit"
          variant="outline"
          size="icon"
          aria-label={t("search")}
        >
          <Search className="size-4" aria-hidden="true" />
        </Button>
        {hasFilters && (
          <Button variant="ghost" asChild>
            <Link href={basePath}>{t("resetFilters")}</Link>
          </Button>
        )}
      </div>
    </form>
  );

  return (
    <div className="w-full space-y-8">
      <PageHeader title={t("title")} description={t("description")} />

      <DataTableShell
        toolbar={filterForm}
        summary={logs ? t("totalCount", { count: logs.length }) : undefined}
      >
        {logs === null ? (
          <div className="p-5">
            <Alert variant="destructive">
              <AlertTriangle className="size-4" aria-hidden="true" />
              <AlertTitle>{tCommon("error")}</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{t("loadError")}</span>
                <Button variant="outline" size="sm" asChild>
                  <Link href={currentHref}>{tCommon("tryAgain")}</Link>
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <DataTable>
            <DataTableHeader>
              <TableRow>
                <TableHead>{t("colDate")}</TableHead>
                <TableHead>{t("colActor")}</TableHead>
                <TableHead>{t("colAction")}</TableHead>
                <TableHead>{t("colSubject")}</TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t("colDetails")}
                </TableHead>
              </TableRow>
            </DataTableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <DataTableEmpty
                  colSpan={COLUMN_COUNT}
                  message={t("noResults")}
                />
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                      {dateTimeFormatter.format(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <span className="block text-sm font-medium">
                        {log.actorType}
                      </span>
                      <span className="block max-w-[10rem] truncate font-mono text-xs text-muted-foreground">
                        {log.actorId || t("systemActor")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                        {log.action}
                      </code>
                    </TableCell>
                    <TableCell>
                      <span className="block text-sm">{log.subjectType}</span>
                      <span className="block max-w-[10rem] truncate font-mono text-xs text-muted-foreground">
                        {log.subjectId}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {log.meta ? (
                        <pre className="max-h-24 max-w-[22rem] overflow-auto rounded border border-border bg-muted/40 p-2 font-mono text-[11px] leading-snug text-muted-foreground">
                          {JSON.stringify(log.meta, null, 2)}
                        </pre>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t("noDetails")}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </DataTable>
        )}
      </DataTableShell>
    </div>
  );
}
