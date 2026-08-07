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
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  if (referrals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No pending referrals.</p>
    );
  }

  const handleModerate = (id: string, action: "approve" | "reject") => {
    if (action === "reject" && !reason) {
      toast.error("Please provide a rejection reason");
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
          action === "approve" ? "Referral approved" : "Referral rejected",
        );
        setReason("");
      } catch {
        toast.error("An error occurred");
      }
    });
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>From</TableHead>
          <TableHead>To Company</TableHead>
          <TableHead>{t.clientName}</TableHead>
          <TableHead>{t.serviceNeeded}</TableHead>
          <TableHead>{t.contactChannel}</TableHead>
          <TableHead>Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {referrals.map((ref) => (
          <TableRow key={ref.id}>
            <TableCell>
              {new Date(ref.createdAt).toLocaleDateString()}
            </TableCell>
            <TableCell>{ref.sender?.displayName || "Unknown"}</TableCell>
            <TableCell>{ref.recipientCompany?.name || "Unknown"}</TableCell>
            <TableCell>{ref.clientName}</TableCell>
            <TableCell>{ref.serviceNeeded}</TableCell>
            <TableCell>
              {ref.contactChannel}
              {ref.note && (
                <div className="text-xs text-muted-foreground mt-1">
                  Note: {ref.note}
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
                  Approve
                </Button>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Reason (if rejecting)"
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
                    Reject
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
