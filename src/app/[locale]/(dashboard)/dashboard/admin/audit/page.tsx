import { setRequestLocale, getTranslations } from "next-intl/server";
import { getCurrentMember } from "@/actions/session";
import { redirect } from "next/navigation";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import { getAuditLogsAction } from "@/actions/admin-audit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default async function AdminAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    actor?: string;
    target?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.audit");
  const session = await getCurrentMember();
  if (!session?.member) {
    redirect(`/${locale}/login`);
  }

  const actor = buildActor(session.member);
  if (!can(actor, "read", "audit_log")) {
    redirect(`/${locale}/dashboard`);
  }

  const filters = await searchParams;
  const logs = await getAuditLogsAction(filters);

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-2">{t("description")}</p>
      </div>

      <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-border/50">
          <form className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_10rem_10rem_auto]">
            <Input
              name="q"
              defaultValue={filters.q}
              placeholder={t("searchPlaceholder")}
            />
            <Input
              name="actor"
              defaultValue={filters.actor}
              placeholder={t("actorPlaceholder")}
            />
            <Input
              name="target"
              defaultValue={filters.target}
              placeholder={t("targetPlaceholder")}
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
            <Button type="submit" className="h-10 rounded-none">
              {t("search")}
            </Button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colDate")}</TableHead>
                <TableHead>{t("colActor")}</TableHead>
                <TableHead>{t("colAction")}</TableHead>
                <TableHead>{t("colSubject")}</TableHead>
                <TableHead>{t("colDetails")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-8"
                  >
                    {t("noResults")}
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {log.createdAt.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">
                          {log.actorType}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground truncate max-w-[120px]">
                          {log.actorId || "System"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-xs uppercase bg-muted/50"
                      >
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">{log.subjectType}</span>
                        <span className="text-xs font-mono text-muted-foreground truncate max-w-[120px]">
                          {log.subjectId}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <pre className="text-[10px] bg-muted/30 p-2 rounded max-w-[200px] overflow-x-auto">
                        {log.meta ? JSON.stringify(log.meta, null, 2) : "-"}
                      </pre>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
