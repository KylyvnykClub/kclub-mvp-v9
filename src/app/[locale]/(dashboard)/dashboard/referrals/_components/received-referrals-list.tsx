"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTransition } from "react";
import { respondToReferralAction } from "@/actions/referral";
import type { ReceivedReferralView } from "@/data/referrals";
import type { ReferralTranslations } from "./referral-translations";
import { toast } from "sonner";

export function ReceivedReferralsList({
  referrals,
  translations: t,
}: {
  referrals: ReceivedReferralView[];
  translations: ReferralTranslations;
}) {
  const [isPending, startTransition] = useTransition();

  if (referrals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No referrals received yet.
      </p>
    );
  }

  const handleAction = (id: string, action: "accept" | "decline") => {
    startTransition(async () => {
      try {
        await respondToReferralAction(id, action);
        toast.success(
          action === "accept" ? "Referral accepted" : "Referral declined",
        );
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
          <TableHead>{t.clientName}</TableHead>
          <TableHead>{t.serviceNeeded}</TableHead>
          <TableHead>Contact / Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {referrals.map((ref) => (
          <TableRow key={ref.id}>
            <TableCell>
              {new Date(ref.createdAt).toLocaleDateString()}
            </TableCell>
            <TableCell>{ref.sender?.displayName || "Unknown"}</TableCell>
            <TableCell>{ref.clientName}</TableCell>
            <TableCell>{ref.serviceNeeded}</TableCell>
            <TableCell>
              {ref.status === "delivered" && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => handleAction(ref.id, "accept")}
                  >
                    {t.accept}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isPending}
                    onClick={() => handleAction(ref.id, "decline")}
                  >
                    {t.decline}
                  </Button>
                </div>
              )}
              {ref.status === "accepted" && (
                <div>
                  <span className="text-sm font-medium">
                    {ref.contactChannel}
                  </span>
                  {ref.note && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Note: {ref.note}
                    </p>
                  )}
                </div>
              )}
              {ref.status !== "delivered" && ref.status !== "accepted" && (
                <Badge variant="secondary">
                  {t.status[ref.status] || ref.status}
                </Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
