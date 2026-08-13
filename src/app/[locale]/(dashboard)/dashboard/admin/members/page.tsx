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
import { Badge } from "@/components/ui/badge";
import { MemberManagementDialog } from "./_components/member-management-dialog";

export default async function AdminMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.members");
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

  const { q } = await searchParams;
  const membersList = await getMembersListAction(q);

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
          <form className="flex space-x-2 max-w-sm">
            <input
              name="q"
              defaultValue={q}
              placeholder={t("searchPlaceholder")}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
            >
              {t("search")}
            </button>
          </form>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colDisplayName")}</TableHead>
              <TableHead>{t("colPhone")}</TableHead>
              <TableHead>{t("colCards")}</TableHead>
              <TableHead>{t("colStatus")}</TableHead>
              <TableHead>{t("colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {membersList.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground py-8"
                >
                  {t("noResults")}
                </TableCell>
              </TableRow>
            ) : (
              membersList.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    {m.displayName || t("notAvailable")}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{m.phone}</TableCell>
                  <TableCell>
                    {m.cards && m.cards.length > 0 ? (
                      <div className="flex flex-col space-y-1">
                        {m.cards.map((c) => (
                          <span key={c.id} className="text-xs">
                            {c.serial}{" "}
                            <Badge
                              variant={
                                c.status === "valid" ? "default" : "secondary"
                              }
                              className="text-[10px] ml-1"
                            >
                              {c.status === "valid"
                                ? tCard("statusValid")
                                : tCard("statusRevoked")}
                            </Badge>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        {t("noCards")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {m.status === "blocked" ? (
                      <Badge variant="destructive">{t("statusBlocked")}</Badge>
                    ) : m.status === "pending_deletion" ? (
                      <Badge variant="secondary">
                        {t("statusPendingDeletion")}
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30">
                        {t("statusActive")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <MemberManagementDialog
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
      </div>
    </div>
  );
}
