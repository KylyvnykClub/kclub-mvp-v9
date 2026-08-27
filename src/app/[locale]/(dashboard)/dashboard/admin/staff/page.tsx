import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  createStaffAction,
  setStaffRoleAction,
  setStaffStatusAction,
} from "@/actions/staff";
import { getCurrentMember } from "@/actions/session";
import { PasswordInput } from "@/components/auth/password-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/data/db";
import { listStaffMembers } from "@/data/staff";
import { buildActor, STAFF_ROLES } from "@/domain/actor";
import { can } from "@/domain/authorization";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AdminStaffPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.staff");
  const tAuth = await getTranslations("auth");

  const session = await getCurrentMember();
  if (!session?.member) {
    redirect(`/${locale}/login`);
  }

  const actor = buildActor(session.member);
  if (!can(actor, "manage_staff", "staff_user")) {
    redirect(`/${locale}/dashboard`);
  }

  const staffMembers = await listStaffMembers(db);

  return (
    <div className="w-full space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("description")}</p>
      </div>

      <form
        action={createStaffAction}
        className="grid gap-3 border border-border/50 p-4 md:grid-cols-[1fr_1fr_9rem_8rem] xl:grid-cols-[1fr_1fr_9rem_7rem_7rem_10rem_auto]"
      >
        <Input name="displayName" placeholder={t("displayName")} required />
        <Input name="phone" placeholder={t("phone")} required />
        <select
          name="role"
          required
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          defaultValue="staff_support"
        >
          {STAFF_ROLES.map((role) => (
            <option key={role} value={role}>
              {t(`roles.${role}`)}
            </option>
          ))}
        </select>
        <Input
          name="country"
          placeholder={t("country")}
          maxLength={2}
          required
        />
        <Input
          name="language"
          placeholder={t("language")}
          maxLength={2}
          required
        />
        <PasswordInput
          name="password"
          placeholder={t("temporaryPassword")}
          required
          showLabel={tAuth("showPassword")}
          hideLabel={tAuth("hidePassword")}
        />
        <Button className="rounded-none">{t("create")}</Button>
      </form>

      <div className="overflow-hidden border border-border/50">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>{t("colName")}</TableHead>
              <TableHead>{t("colPhone")}</TableHead>
              <TableHead>{t("colRole")}</TableHead>
              <TableHead>{t("colStatus")}</TableHead>
              <TableHead className="text-right">{t("colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staffMembers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-muted-foreground"
                >
                  {t("noResults")}
                </TableCell>
              </TableRow>
            ) : (
              staffMembers.map((staffMember) => {
                const isSelf = staffMember.id === session.member.id;

                return (
                  <TableRow key={staffMember.id}>
                    <TableCell className="font-medium">
                      {staffMember.displayName}
                      {isSelf ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t("self")}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {staffMember.phone}
                    </TableCell>
                    <TableCell>
                      <form action={setStaffRoleAction} className="flex gap-2">
                        <input
                          type="hidden"
                          name="staffId"
                          value={staffMember.id}
                        />
                        <select
                          name="role"
                          defaultValue={staffMember.role}
                          disabled={isSelf}
                          className="h-9 min-w-40 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {STAFF_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {t(`roles.${role}`)}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 rounded-none text-xs"
                          disabled={isSelf}
                        >
                          {t("saveRole")}
                        </Button>
                      </form>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          staffMember.status === "active"
                            ? "default"
                            : "secondary"
                        }
                        className="rounded-none"
                      >
                        {staffMember.status === "active"
                          ? t("statusActive")
                          : t("statusDisabled")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <form
                        action={async () => {
                          "use server";
                          await setStaffStatusAction(
                            staffMember.id,
                            staffMember.status,
                          );
                        }}
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 rounded-none text-xs"
                          disabled={isSelf}
                        >
                          {staffMember.status === "active"
                            ? t("disable")
                            : t("enable")}
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
