"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { moderateCompanyAction } from "@/actions/company";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";

const REJECT_REASON_KEYS = [
  "rejectReasonProhibited",
  "rejectReasonIncomplete",
  "rejectReasonDuplicate",
  "rejectReasonInaccurate",
  "rejectReasonOther",
] as const;

export function ModerateActions({ companyId }: { companyId: string }) {
  const t = useTranslations("admin.companies");
  const [isLoading, setIsLoading] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const router = useRouter();

  const handleApprove = async () => {
    if (!confirm(t("approveConfirm"))) return;

    setIsLoading(true);
    const res = await moderateCompanyAction(companyId, "approved");
    setIsLoading(false);

    if (res.success) {
      alert(t("approved"));
      router.refresh();
    } else {
      alert(t("actionFailed", { error: res.error ?? "" }));
    }
  };

  const handleReject = async () => {
    const reason =
      selectedReason === "rejectReasonOther"
        ? customReason
        : t(selectedReason as (typeof REJECT_REASON_KEYS)[number]);

    if (!reason.trim()) return;

    setIsLoading(true);
    const res = await moderateCompanyAction(companyId, "rejected", reason);
    setIsLoading(false);

    if (res.success) {
      alert(t("rejected"));
      setShowRejectForm(false);
      router.refresh();
    } else {
      alert(t("actionFailed", { error: res.error ?? "" }));
    }
  };

  if (showRejectForm) {
    return (
      <div className="space-y-3 min-w-[280px]">
        <p className="text-sm font-medium">{t("rejectReasonLabel")}</p>
        <select
          value={selectedReason}
          onChange={(e) => setSelectedReason(e.target.value)}
          className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">{t("rejectReasonSelect")}</option>
          {REJECT_REASON_KEYS.map((key) => (
            <option key={key} value={key}>
              {t(key)}
            </option>
          ))}
        </select>
        {selectedReason === "rejectReasonOther" && (
          <textarea
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder={t("rejectReasonCustomPlaceholder")}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            rows={2}
          />
        )}
        <div className="flex gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => void handleReject()}
            disabled={
              isLoading ||
              !selectedReason ||
              (selectedReason === "rejectReasonOther" && !customReason.trim())
            }
          >
            {t("confirmReject")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowRejectForm(false);
              setSelectedReason("");
              setCustomReason("");
            }}
          >
            {t("cancel")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => void handleApprove()}
        disabled={isLoading}
        className="text-green-500 hover:text-green-600 hover:bg-green-500/10"
      >
        <Check className="w-4 h-4 mr-1" /> {t("approve")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowRejectForm(true)}
        disabled={isLoading}
        className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
      >
        <X className="w-4 h-4 mr-1" /> {t("reject")}
      </Button>
    </div>
  );
}
