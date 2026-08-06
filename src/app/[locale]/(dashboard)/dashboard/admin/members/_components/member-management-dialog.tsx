"use client";

import { useState, useTransition } from "react";
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An error occurred";
}

export function MemberManagementDialog({
  member,
}: {
  member: MemberAdminView;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [reason, setReason] = useState("");
  const [newTier, setNewTier] = useState<"free" | "vip">("free");

  const handleBlockToggle = () => {
    const isBlocked = member.status === "blocked";
    if (!reason && !isBlocked) {
      toast.error("Reason is required to block a member");
      return;
    }

    startTransition(async () => {
      try {
        await blockMemberAction(member.id, !isBlocked, reason);
        toast.success(isBlocked ? "Member unblocked" : "Member blocked");
        setOpen(false);
        window.location.reload();
      } catch (err) {
        toast.error(errorMessage(err));
      }
    });
  };

  const handleRevokeCard = (cardId: string) => {
    if (!reason) {
      toast.error("Reason is required to revoke a card");
      return;
    }

    startTransition(async () => {
      try {
        await revokeCardAction(cardId, reason);
        toast.success("Card revoked");
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
        toast.success("New card issued");
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
          Manage
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            Manage Member: {member.displayName || member.phone}
          </DialogTitle>
          <DialogDescription>
            Administer member status and cards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <h4 className="font-medium text-sm border-b pb-2">Status</h4>
            <div className="flex justify-between items-center">
              <span className="text-sm">
                Account Status:{" "}
                {member.status === "blocked" ? (
                  <Badge variant="destructive">Blocked</Badge>
                ) : (
                  <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/30">
                    Active
                  </Badge>
                )}
              </span>
            </div>

            <div className="space-y-2">
              <Label>Reason (Required for blocking or revoking)</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Violation of terms..."
              />
            </div>

            <Button
              variant={member.status === "blocked" ? "default" : "destructive"}
              className="w-full"
              onClick={handleBlockToggle}
              disabled={isPending}
            >
              {member.status === "blocked" ? "Unblock Member" : "Block Member"}
            </Button>
          </div>

          <div className="space-y-4">
            <h4 className="font-medium text-sm border-b pb-2">Cards</h4>
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
                        {card.status}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Tier: {card.tier}</span>
                      {card.status === "valid" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRevokeCard(card.id)}
                          disabled={isPending}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No cards found.</p>
            )}

            <div className="pt-2 space-y-2">
              <Label>Issue New Card</Label>
              <div className="flex space-x-2">
                <Select
                  value={newTier}
                  onValueChange={(val: "free" | "vip") => setNewTier(val)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="vip">VIP</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleReissueCard} disabled={isPending}>
                  Issue
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
