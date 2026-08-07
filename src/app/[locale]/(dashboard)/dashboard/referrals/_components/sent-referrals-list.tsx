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
import { useTranslations } from "next-intl";
import type { SentReferralView } from "@/data/referrals";
import type { ReferralTranslations } from "./referral-translations";

export function SentReferralsList({
  referrals,
  translations: t,
}: {
  referrals: SentReferralView[];
  translations: ReferralTranslations;
}) {
  const tr = useTranslations("Referral");

  if (referrals.length === 0) {
    return <p className="text-sm text-muted-foreground">{tr("noSent")}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{tr("dateColumn")}</TableHead>
          <TableHead>{t.clientName}</TableHead>
          <TableHead>{tr("companyColumn")}</TableHead>
          <TableHead>{tr("statusColumn")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {referrals.map((ref) => (
          <TableRow key={ref.id}>
            <TableCell>
              {new Date(ref.createdAt).toLocaleDateString()}
            </TableCell>
            <TableCell>{ref.clientName}</TableCell>
            <TableCell>{ref.recipientCompany?.name || tr("unknown")}</TableCell>
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
