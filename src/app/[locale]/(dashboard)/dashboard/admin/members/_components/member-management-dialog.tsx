"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  blockMemberAction,
  revokeCardAction,
  reissueCardAction,
} from "@/actions/admin-members";
import type { MemberAdminDirectoryView } from "@/data/members";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

function memberStatusBadge(
  status: string,
  t: ReturnType<typeof useTranslations>,
) {
  if (status === "blocked") {
    return <Badge variant="destructive">{t("statusBlocked")}</Badge>;
  }
  if (status === "pending_deletion") {
    return <Badge variant="secondary">{t("statusPendingDeletion")}</Badge>;
  }
  return (
    <Badge className="border-emerald-500/20 bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30">
      {t("statusActive")}
    </Badge>
  );
}

export function MemberManagementDialog({
  member,
  canManage,
}: {
  member: MemberAdminDirectoryView;
  canManage: boolean;
}) {
  const t = useTranslations("admin.members");
  const tCard = useTranslations("card");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [reason, setReason] = useState("");
  const [newTier, setNewTier] = useState<"free" | "vip">("free");

  const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : tCommon("error");

  const handleBlockToggle = () => {
    const isBlocked = member.status === "blocked";
    if (!reason) {
      toast.error(t("reasonRequiredStatus"));
      return;
    }

    startTransition(async () => {
      try {
        await blockMemberAction(member.id, !isBlocked, reason);
        toast.success(isBlocked ? t("unblocked") : t("blocked"));
        setOpen(false);
        window.location.reload();
      } catch (err) {
        toast.error(errorMessage(err));
      }
    });
  };

  const handleRevokeCard = (cardId: string) => {
    if (!reason) {
      toast.error(t("reasonRequiredRevoke"));
      return;
    }

    startTransition(async () => {
      try {
        await revokeCardAction(cardId, reason);
        toast.success(t("cardRevoked"));
        window.location.reload();
      } catch (err) {
        toast.error(errorMessage(err));
      }
    });
  };

  const handleReissueCard = () => {
    startTransition(async () => {
      try {
        await reissueCardAction(member.id, newTier);
        toast.success(t("cardIssued"));
        window.location.reload();
      } catch (err) {
        toast.error(errorMessage(err));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {canManage ? t("manage") : t("view")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("manageTitle", {
              name: member.displayName || member.phone,
            })}
          </DialogTitle>
          <DialogDescription>
            {canManage ? t("manageDescription") : t("viewDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <section className="space-y-3">
            <h4 className="border-b pb-2 text-sm font-medium">
              {t("statusSection")}
            </h4>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">{t("accountStatus")}</span>
              {memberStatusBadge(member.status, t)}
            </div>

            {canManage && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>{t("reasonLabel")}</Label>
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t("reasonPlaceholder")}
                  />
                </div>

                <Button
                  variant={
                    member.status === "blocked" ? "default" : "destructive"
                  }
                  className="w-full"
                  onClick={handleBlockToggle}
                  disabled={isPending}
                >
                  {member.status === "blocked" ? t("unblock") : t("block")}
                </Button>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h4 className="border-b pb-2 text-sm font-medium">
              {t("subscriptionsSection")}
            </h4>
            {member.subscriptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("noSubscriptionsFound")}
              </p>
            ) : (
              <div className="space-y-2">
                {member.subscriptions.map((subscription) => (
                  <div
                    key={subscription.id}
                    className="rounded-md border p-3 text-sm"
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
                      {new Date(
                        subscription.currentPeriodEnd,
                      ).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h4 className="border-b pb-2 text-sm font-medium">
              {t("cardsSection")}
            </h4>
            {member.cards.length > 0 ? (
              <div className="space-y-3">
                {member.cards.map((card) => (
                  <div
                    key={card.id}
                    className="space-y-2 rounded-md border p-3 text-sm"
                  >
                    <div className="flex justify-between gap-3">
                      <span className="font-mono">{card.serial}</span>
                      <Badge
                        variant={
                          card.status === "valid" ? "default" : "destructive"
                        }
                      >
                        {card.status === "valid"
                          ? tCard("statusValid")
                          : tCard("statusRevoked")}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-muted-foreground">
                      <span>
                        {t("tierLabel")}:{" "}
                        {card.tier === "vip"
                          ? tCard("tierVip")
                          : tCard("tierFree")}
                      </span>
                      {canManage && card.status === "valid" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRevokeCard(card.id)}
                          disabled={isPending}
                        >
                          {t("revoke")}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("noCardsFound")}
              </p>
            )}

            {canManage && (
              <div className="space-y-2 pt-2">
                <Label>{t("issueNew")}</Label>
                <div className="flex space-x-2">
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
            )}
          </section>

          <section className="space-y-3">
            <h4 className="border-b pb-2 text-sm font-medium">
              {t("historySection")}
            </h4>
            {member.activityHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("noHistoryFound")}
              </p>
            ) : (
              <div className="space-y-2">
                {member.activityHistory.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-md border p-3 text-xs text-muted-foreground"
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
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
