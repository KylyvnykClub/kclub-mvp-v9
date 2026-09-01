import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { UserRoundX, UserRoundCheck } from "lucide-react";
import {
  createStaffAction,
  setStaffRoleAction,
  setStaffStatusAction,
} from "@/actions/staff";
import { getCurrentMember } from "@/actions/session";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/data/db";
import { listStaffMembers } from "@/data/staff";
import { buildActor, STAFF_ROLES } from "@/domain/actor";
import { can } from "@/domain/authorization";
import { PageHeader } from "../_components/page-header";
import { ConsoleSection } from "../_components/console-section";
import { ConfirmActionButton } from "../_components/confirm-action-button";
import { StatusBadge } from "../_components/status-badge";
import {
  DataTable,
  DataTableEmpty,
  DataTableHeader,
  DataTableShell,
} from "../_components/data-table";

const COLUMN_COUNT = 6;

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

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
      <PageHeader title={t("title")} description={t("description")} />

      <ConsoleSection
        title={t("createTitle")}
        description={t("createDescription")}
      >
        <form
          action={createStaffAction}
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          <div className="space-y-2">
            <Label htmlFor="staff-display-name">{t("displayName")}</Label>
            <Input id="staff-display-name" name="displayName" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-phone">{t("phone")}</Label>
            <Input id="staff-phone" name="phone" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-role">{t("roleLabel")}</Label>
            <select
              id="staff-role"
              name="role"
              required
              className={SELECT_CLASS}
              defaultValue="staff_support"
            >
              {STAFF_ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-country">{t("country")}</Label>
            <Input id="staff-country" name="country" maxLength={2} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-language">{t("language")}</Label>
            <Input id="staff-language" name="language" maxLength={2} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-password">{t("temporaryPassword")}</Label>
            <PasswordInput
              id="staff-password"
              name="password"
              required
              showLabel={tAuth("showPassword")}
              hideLabel={tAuth("hidePassword")}
            />
          </div>
          <div className="flex items-end md:col-span-2 xl:col-span-3">
            <Button type="submit">{t("create")}</Button>
          </div>
        </form>
      </ConsoleSection>

      <DataTableShell>
        <DataTable>
          <DataTableHeader>
            <TableRow>
              <TableHead>{t("colName")}</TableHead>
              <TableHead className="hidden sm:table-cell">
                {t("colPhone")}
              </TableHead>
              <TableHead>{t("colRole")}</TableHead>
              <TableHead className="hidden md:table-cell">
                {t("colTotp")}
              </TableHead>
              <TableHead>{t("colStatus")}</TableHead>
              <TableHead className="text-right">{t("colActions")}</TableHead>
            </TableRow>
          </DataTableHeader>
          <TableBody>
            {staffMembers.length === 0 ? (
              <DataTableEmpty colSpan={COLUMN_COUNT} message={t("noResults")} />
            ) : (
              staffMembers.map((staffMember) => {
                const isSelf = staffMember.id === session.member.id;
                const isActive = staffMember.status === "active";

                return (
                  <TableRow key={staffMember.id}>
                    <TableCell>
                      <span className="font-medium">
                        {staffMember.displayName}
                      </span>
                      {isSelf && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t("self")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs sm:table-cell">
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
                          aria-label={t("roleLabel")}
                          className={`${SELECT_CLASS} h-8 min-w-36 py-1`}
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
                          className="h-8 text-xs"
                          disabled={isSelf}
                        >
                          {t("saveRole")}
                        </Button>
                      </form>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <StatusBadge
                        tone={staffMember.totpEnabled ? "positive" : "warning"}
                        label={
                          staffMember.totpEnabled ? t("totpOn") : t("totpOff")
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={isActive ? "positive" : "negative"}
                        label={
                          isActive ? t("statusActive") : t("statusDisabled")
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Disabling signs the person out everywhere (FR-082),
                          so the click gets a confirmation step. */}
                      <ConfirmActionButton
                        action={async () => {
                          "use server";
                          await setStaffStatusAction(
                            staffMember.id,
                            staffMember.status,
                          );
                        }}
                        label={isActive ? t("disable") : t("enable")}
                        icon={
                          isActive ? (
                            <UserRoundX className="size-4" aria-hidden="true" />
                          ) : (
                            <UserRoundCheck
                              className="size-4"
                              aria-hidden="true"
                            />
                          )
                        }
                        title={isActive ? t("disableTitle") : t("enableTitle")}
                        description={t(
                          isActive ? "disableDescription" : "enableDescription",
                          { name: staffMember.displayName },
                        )}
                        confirmLabel={isActive ? t("disable") : t("enable")}
                        successMessage={
                          isActive ? t("disabledToast") : t("enabledToast")
                        }
                        destructive={isActive}
                        disabled={isSelf}
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
