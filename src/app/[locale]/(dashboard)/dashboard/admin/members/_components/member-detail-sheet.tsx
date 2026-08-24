"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { SheetTrigger } from "@/components/ui/sheet";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  blockMemberAction,
  resetMemberPasswordAction,
  revokeCardAction,
  reissueCardAction,
} from "@/actions/admin-members";
import type { MemberAdminDirectoryView } from "@/data/members";
import { computeProfileCompleteness } from "@/domain/profile-completeness";
import { AdminDetailSheet } from "../../_components/admin-detail-sheet";
import { StatusBadge, memberStatusTone } from "../../_components/status-badge";

const MISSING_FIELD_KEYS = {
  bio: "fieldBio",
  industry: "fieldIndustry",
  location: "fieldLocation",
  avatarUrl: "fieldAvatarUrl",
  totpEnabled: "fieldTotpEnabled",
} as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h4 className="border-b border-border pb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

export function MemberDetailSheet({
  member,
  canExport,
  canManage,
}: {
  member: MemberAdminDirectoryView;
  canExport: boolean;
  canManage: boolean;
}) {
  const t = useTranslations("admin.members");
  const tCard = useTranslations("card");
  const tCommon = useTranslations("common");
  const tAuth = useTranslations("auth");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [newTier, setNewTier] = useState<"free" | "vip">("free");
  const [newPassword, setNewPassword] = useState("");

  const completeness = computeProfileCompleteness({
    totpEnabled: member.totpEnabled,
    profile: member.profile ?? null,
  });

  const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : tCommon("error");

  /**
   * router.refresh() re-runs the server component with the current search,
   * filter and page intact. The full page reload this replaces dropped the
   * staff member back onto an unfiltered first page after every action.
   */
  const runAction = (work: () => Promise<unknown>, successMessage: string) => {
    startTransition(async () => {
      try {
        await work();
        toast.success(successMessage);
        setReason("");
        router.refresh();
      } catch (err) {
        toast.error(errorMessage(err));
      }
    });
  };

  const isBlocked = member.status === "blocked";

  const statusLabel = t(
    member.status === "blocked"
      ? "statusBlocked"
      : member.status === "pending_deletion"
        ? "statusPendingDeletion"
        : "statusActive",
  );

  const handleBlockToggle = () => {
    if (!reason) {
      toast.error(t("reasonRequiredStatus"));
      return;
    }

    runAction(
      () => blockMemberAction(member.id, !isBlocked, reason),
      isBlocked ? t("unblocked") : t("blocked"),
    );
  };

  const handleResetPassword = () => {
    if (!reason) {
      toast.error(t("reasonRequiredReset"));
      return;
    }
    if (newPassword.length < 8) {
      toast.error(t("passwordTooShort"));
      return;
    }

    runAction(
      () => resetMemberPasswordAction(member.id, newPassword, reason),
      t("passwordReset"),
    );
    setNewPassword("");
  };

  const handleRevokeCard = (cardId: string) => {
    if (!reason) {
      toast.error(t("reasonRequiredRevoke"));
      return;
    }

    runAction(() => revokeCardAction(cardId, reason), t("cardRevoked"));
  };

  const handleReissueCard = () => {
    runAction(() => reissueCardAction(member.id, newTier), t("cardIssued"));
  };

  const validCards = member.cards.filter((card) => card.status === "valid");

  const infoTab = (
    <div className="space-y-6">
      <Section title={t("overviewSection")}>
        <div className="space-y-2">
          <Field
            label={t("accountStatus")}
            value={
              <StatusBadge
                tone={memberStatusTone(member.status)}
                label={statusLabel}
              />
            }
          />
          <Field
            label={t("phoneLabel")}
            value={<span className="font-mono text-xs">{member.phone}</span>}
          />
          <Field label={t("countryLabel")} value={member.country} />
          <Field label={t("languageLabel")} value={member.language} />
          <Field
            label={t("joinedLabel")}
            value={new Date(member.createdAt).toLocaleDateString()}
          />
        </div>
      </Section>

      <Section title={t("profileCompleteness")}>
        <div className="space-y-2">
          <Progress value={completeness.percent} />
          <p className="text-sm font-medium">
            {t("profileCompletenessValue", { percent: completeness.percent })}
          </p>
          {completeness.missing.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("missingLabel")}{" "}
              {completeness.missing
                .map((field) =>
                  t(
                    MISSING_FIELD_KEYS[
                      field as keyof typeof MISSING_FIELD_KEYS
                    ],
                  ),
                )
                .join(", ")}
            </p>
          )}
        </div>
      </Section>

      <Section title={t("subscriptionsSection")}>
        {member.subscriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("noSubscriptionsFound")}
          </p>
        ) : (
          <div className="space-y-2">
            {member.subscriptions.map((subscription) => (
              <div
                key={subscription.id}
                className="rounded-md border border-border p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {subscription.company
                        ? t("listingSubscription", {
                            name: subscription.company.name,
                          })
                        : t("vipSubscription")}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {subscription.stripeSubscriptionId}
                    </p>
                  </div>
                  <Badge variant="outline">{subscription.status}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("periodEnds")}{" "}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={t("cardsSection")}>
        {member.cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noCardsFound")}</p>
        ) : (
          <div className="space-y-2">
            {member.cards.map((card) => (
              <div
                key={card.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
              >
                <span className="font-mono">{card.serial}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {card.tier === "vip" ? tCard("tierVip") : tCard("tierFree")}
                  </span>
                  <StatusBadge
                    tone={card.status === "valid" ? "positive" : "negative"}
                    label={
                      card.status === "valid"
                        ? tCard("statusValid")
                        : tCard("statusRevoked")
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={t("historySection")}>
        {member.activityHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noHistoryFound")}</p>
        ) : (
          <div className="space-y-2">
            {member.activityHistory.map((entry) => (
              <div
                key={entry.id}
                className="rounded-md border border-border p-3 text-xs text-muted-foreground"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-foreground">
                    {entry.action}
                  </span>
                  <span>{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-1 font-mono">
                  {entry.subjectType}:{entry.subjectId}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );

  const settingsTab = (
    <div className="space-y-6">
      {!canManage && !canExport && (
        <p className="text-sm text-muted-foreground">{t("viewDescription")}</p>
      )}

      {canExport && (
        <Section title={t("dataExportSection")}>
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/admin/export/member/${member.id}`} download>
              {t("exportData")}
            </a>
          </Button>
        </Section>
      )}

      {canManage && (
        <>
          <Section title={t("statusSection")}>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  {t("accountStatus")}
                </span>
                <StatusBadge
                  tone={memberStatusTone(member.status)}
                  label={statusLabel}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`reason-${member.id}`}>
                  {t("reasonLabel")}
                </Label>
                <Input
                  id={`reason-${member.id}`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("reasonPlaceholder")}
                />
              </div>
              <Button
                variant={isBlocked ? "default" : "destructive"}
                className="w-full"
                onClick={handleBlockToggle}
                disabled={isPending}
              >
                {isBlocked ? t("unblock") : t("block")}
              </Button>

              {/* ADR 0018: the only account recovery there is. The reason field
                  above is where the identity proof accepted gets recorded, since
                  nothing here can verify it. */}
              <div className="space-y-2 border-t border-border pt-4">
                <Label htmlFor={`new-password-${member.id}`}>
                  {t("newPasswordLabel")}
                </Label>
                <PasswordInput
                  id={`new-password-${member.id}`}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("newPasswordPlaceholder")}
                  showLabel={tAuth("showPassword")}
                  hideLabel={tAuth("hidePassword")}
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">
                  {t("resetPasswordHint")}
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleResetPassword}
                  disabled={isPending}
                >
                  {t("resetPassword")}
                </Button>
              </div>
            </div>
          </Section>

          <Section title={t("cardsSection")}>
            {validCards.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("noCardsFound")}
              </p>
            ) : (
              <div className="space-y-2">
                {validCards.map((card) => (
                  <div
                    key={card.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
                  >
                    <span className="font-mono">{card.serial}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRevokeCard(card.id)}
                      disabled={isPending}
                    >
                      {t("revoke")}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 pt-2">
              <Label>{t("issueNew")}</Label>
              <div className="flex gap-2">
                <Select
                  value={newTier}
                  onValueChange={(val: "free" | "vip") => setNewTier(val)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">{t("tierFree")}</SelectItem>
                    <SelectItem value="vip">{t("tierVip")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleReissueCard} disabled={isPending}>
                  {t("issue")}
                </Button>
              </div>
            </div>
          </Section>
        </>
      )}
    </div>
  );

  return (
    <AdminDetailSheet
      open={open}
      onOpenChange={setOpen}
      trigger={
        <SheetTrigger asChild>
          <Button variant="outline" size="sm">
            {canManage ? t("manage") : t("view")}
          </Button>
        </SheetTrigger>
      }
      title={t("manageTitle", { name: member.displayName || member.phone })}
      description={canManage ? t("manageDescription") : t("viewDescription")}
      tabs={[
        { value: "info", label: t("tabInfo"), content: infoTab },
        { value: "settings", label: t("tabSettings"), content: settingsTab },
      ]}
    />
  );
}
