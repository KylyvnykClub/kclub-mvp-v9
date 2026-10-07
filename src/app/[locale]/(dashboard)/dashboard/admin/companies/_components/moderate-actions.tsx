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
  cardHeld,
  waived = false,
  freeMonth,
  onModerated,
}: {
  companyId: string;
  /**
   * The listing price is reserved on the partner's card (ADR 0037). Approving
   * captures it; rejecting releases it. Without a reservation there is nothing
   * to approve - the server refuses it (FR-113) and the button says why.
   */
  cardHeld: boolean;
  /** ADR 0040: the listing is free through the partner link. */
  waived?: boolean;
  /**
   * ADR 0044: set when a card is saved rather than held - true for the
   * invite route's free month, false for an EU deferred start.
   */
  freeMonth?: boolean;
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
        // What happened to the money, so the moderator is never left to
        // guess. Capture is only asked for here; the listing goes live when
        // Stripe confirms it.
        const paymentNote =
          "payment" in res && res.payment === "retrying"
            ? t("paymentRetrying")
            : status === "approved"
              ? "payment" in res && res.payment === "capture_requested"
                ? t("paymentCaptureRequested")
                : t("paymentNotHeld")
              : "payment" in res && res.payment === "released"
                ? t("paymentReleased")
                : undefined;
        toast.success(successMessage, { description: paymentNote });
        reset();
        router.refresh();
        onModerated?.();
        return;
      }

      toast.error(
        res.error === "hold_required"
          ? t("approveNeedsHold")
          : t("actionFailed", { error: res.error ?? "" }),
      );
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
        <p className="text-xs text-muted-foreground">
          {waived
            ? t("approveWaived")
            : freeMonth === true
              ? t("approveStartsFreeMonth")
              : freeMonth === false
                ? t("approveStartsSubscription")
                : t("approveCapturesHold")}
        </p>
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
        {cardHeld && (
          <p className="text-xs text-muted-foreground">
            {t("rejectReleasesHold")}
          </p>
        )}
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

  // FR-113: approval captures the held price, so without a hold there is
  // nothing to approve. The server refuses it too; this only says why.
  return (
    <div className="flex flex-wrap gap-2">
      {!cardHeld && !waived && (
        <p className="w-full text-xs text-muted-foreground">
          {t("approveNeedsHold")}
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setMode("confirmApprove")}
        disabled={isPending || (!cardHeld && !waived)}
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
