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
import type { SentReferralView } from "@/data/referrals";
import type { ReferralTranslations } from "./referral-translations";

export function SentReferralsList({
  referrals,
  translations: t,
}: {
  referrals: SentReferralView[];
  translations: ReferralTranslations;
}) {
  if (referrals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No referrals sent yet.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>{t.clientName}</TableHead>
          <TableHead>Company</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {referrals.map((ref) => (
          <TableRow key={ref.id}>
            <TableCell>
              {new Date(ref.createdAt).toLocaleDateString()}
            </TableCell>
            <TableCell>{ref.clientName}</TableCell>
            <TableCell>{ref.recipientCompany?.name || "Unknown"}</TableCell>
            <TableCell>
              <Badge
                variant={ref.status === "accepted" ? "default" : "secondary"}
              >
                {t.status[ref.status] || ref.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
