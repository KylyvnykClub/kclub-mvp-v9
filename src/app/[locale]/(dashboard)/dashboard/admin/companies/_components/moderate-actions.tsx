"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { moderateCompanyAction } from "@/actions/company";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const REJECT_REASON_KEYS = [
  "rejectReasonProhibited",
  "rejectReasonIncomplete",
  "rejectReasonDuplicate",
  "rejectReasonInaccurate",
  "rejectReasonOther",
] as const;

type Mode = "idle" | "confirmApprove" | "reject";

export function ModerateActions({
  companyId,
  onModerated,
}: {
  companyId: string;
  /** Called after a decision lands - the sheet uses it to close itself. */
  onModerated?: () => void;
}) {
  const t = useTranslations("admin.companies");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("idle");
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");

  const reset = () => {
    setMode("idle");
    setSelectedReason("");
    setCustomReason("");
  };

  const moderate = (
    status: "approved" | "rejected",
    reason: string | undefined,
    successMessage: string,
  ) => {
    startTransition(async () => {
      const res = await moderateCompanyAction(companyId, status, reason);

      if (res.success) {
        toast.success(successMessage);
        reset();
        router.refresh();
        onModerated?.();
        return;
      }

      toast.error(t("actionFailed", { error: res.error ?? "" }));
    });
  };

  const handleReject = () => {
    const reason =
      selectedReason === "rejectReasonOther"
        ? customReason
        : t(selectedReason as (typeof REJECT_REASON_KEYS)[number]);

    if (!reason.trim()) return;

    moderate("rejected", reason, t("rejected"));
  };

  // Approval publishes the listing to the public catalogue, so it keeps a
  // confirmation step - as an inline one, since the native confirm() it
  // replaces cannot be styled, translated or tested.
  if (mode === "confirmApprove") {
    return (
      <div className="min-w-[240px] space-y-3">
        <p className="text-sm">{t("approveConfirm")}</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => moderate("approved", undefined, t("approved"))}
            disabled={isPending}
          >
            {t("confirmApprove")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={isPending}
          >
            {t("cancel")}
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "reject") {
    return (
      <div className="min-w-[280px] space-y-3">
        <p className="text-sm font-medium">{t("rejectReasonLabel")}</p>
        <Select value={selectedReason} onValueChange={setSelectedReason}>
          <SelectTrigger>
            <SelectValue placeholder={t("rejectReasonSelect")} />
          </SelectTrigger>
          <SelectContent>
            {REJECT_REASON_KEYS.map((key) => (
              <SelectItem key={key} value={key}>
                {t(key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedReason === "rejectReasonOther" && (
          <Textarea
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder={t("rejectReasonCustomPlaceholder")}
            rows={2}
          />
        )}
        <div className="flex gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleReject}
            disabled={
              isPending ||
              !selectedReason ||
              (selectedReason === "rejectReasonOther" && !customReason.trim())
            }
          >
            {t("confirmReject")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={isPending}
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
        onClick={() => setMode("confirmApprove")}
        disabled={isPending}
        className="text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-600"
      >
        <Check className="mr-1 size-4" /> {t("approve")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setMode("reject")}
        disabled={isPending}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="mr-1 size-4" /> {t("reject")}
      </Button>
    </div>
  );
}
