"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useTransition, useState } from "react";
import { useTranslations } from "next-intl";
import { moderateReferralAction } from "@/actions/referral";
import type { PendingReferralView } from "@/data/referrals";
import { toast } from "sonner";

export function AdminReferralsList({
  referrals,
  translations: t,
}: {
  referrals: PendingReferralView[];
  translations: Record<string, string>;
}) {
  const tr = useTranslations("Referral");
  const tCommon = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  if (referrals.length === 0) {
    return <p className="text-sm text-muted-foreground">{tr("noPending")}</p>;
  }

  const handleModerate = (id: string, action: "approve" | "reject") => {
    if (action === "reject" && !reason) {
      toast.error(tr("rejectReasonRequired"));
      return;
    }

    startTransition(async () => {
      try {
        await moderateReferralAction(
          id,
          action,
          action === "reject" ? reason : undefined,
        );
        toast.success(
          action === "approve" ? tr("approvedToast") : tr("rejectedToast"),
        );
        setReason("");
      } catch {
        toast.error(tCommon("error"));
      }
    });
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{tr("dateColumn")}</TableHead>
          <TableHead>{tr("fromColumn")}</TableHead>
          <TableHead>{tr("toCompanyColumn")}</TableHead>
          <TableHead>{t.clientName}</TableHead>
          <TableHead>{t.serviceNeeded}</TableHead>
          <TableHead>{t.contactChannel}</TableHead>
          <TableHead>{tr("actionColumn")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {referrals.map((ref) => (
          <TableRow key={ref.id}>
            <TableCell>
              {new Date(ref.createdAt).toLocaleDateString()}
            </TableCell>
            <TableCell>{ref.sender?.displayName || tr("unknown")}</TableCell>
            <TableCell>{ref.recipientCompany?.name || tr("unknown")}</TableCell>
            <TableCell>{ref.clientName}</TableCell>
            <TableCell>{ref.serviceNeeded}</TableCell>
            <TableCell>
              {ref.contactChannel}
              {ref.note && (
                <div className="text-xs text-muted-foreground mt-1">
                  {tr("notePrefix")} {ref.note}
                </div>
              )}
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => handleModerate(ref.id, "approve")}
                >
                  {tr("approve")}
                </Button>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={tr("rejectReasonPlaceholder")}
                    className="text-xs border px-2 py-1 flex-1 bg-transparent"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isPending}
                    onClick={() => handleModerate(ref.id, "reject")}
                  >
                    {tr("reject")}
                  </Button>
                </div>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
