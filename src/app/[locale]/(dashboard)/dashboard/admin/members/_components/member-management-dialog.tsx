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
import type { MemberAdminView } from "@/data/members";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export function MemberManagementDialog({
  member,
}: {
  member: MemberAdminView;
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
    if (!reason && !isBlocked) {
      toast.error(t("reasonRequiredBlock"));
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
          {t("manage")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {t("manageTitle", {
              name: member.displayName || member.phone,
            })}
          </DialogTitle>
          <DialogDescription>{t("manageDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <h4 className="font-medium text-sm border-b pb-2">
              {t("statusSection")}
            </h4>
            <div className="flex justify-between items-center">
              <span className="text-sm">
                {t("accountStatus")}{" "}
                {member.status === "blocked" ? (
                  <Badge variant="destructive">{t("statusBlocked")}</Badge>
                ) : (
                  <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/30">
                    {t("statusActive")}
                  </Badge>
                )}
              </span>
            </div>

            <div className="space-y-2">
              <Label>{t("reasonLabel")}</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("reasonPlaceholder")}
              />
            </div>

            <Button
              variant={member.status === "blocked" ? "default" : "destructive"}
              className="w-full"
              onClick={handleBlockToggle}
              disabled={isPending}
            >
              {member.status === "blocked" ? t("unblock") : t("block")}
            </Button>
          </div>

          <div className="space-y-4">
            <h4 className="font-medium text-sm border-b pb-2">
              {t("cardsSection")}
            </h4>
            {member.cards && member.cards.length > 0 ? (
              <div className="space-y-3">
                {member.cards.map((card) => (
                  <div
                    key={card.id}
                    className="flex flex-col space-y-2 p-3 border rounded-md text-sm"
                  >
                    <div className="flex justify-between">
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
                    <div className="flex justify-between text-muted-foreground">
                      <span>
                        {t("tierLabel")}:{" "}
                        {card.tier === "vip"
                          ? tCard("tierVip")
                          : tCard("tierFree")}
                      </span>
                      {card.status === "valid" && (
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

            <div className="pt-2 space-y-2">
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
