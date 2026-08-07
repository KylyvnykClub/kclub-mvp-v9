"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { moderateCompanyAction } from "@/actions/company";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";

export function ModerateActions({ companyId }: { companyId: string }) {
  const t = useTranslations("admin.companies");
  const [isLoading, setIsLoading] = useState(false);
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
    const reason = window.prompt(t("rejectPrompt"));
    if (reason === null) return; // cancelled

    setIsLoading(true);
    const res = await moderateCompanyAction(companyId, "rejected", reason);
    setIsLoading(false);

    if (res.success) {
      alert(t("rejected"));
      router.refresh();
    } else {
      alert(t("actionFailed", { error: res.error ?? "" }));
    }
  };

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
        onClick={() => void handleReject()}
        disabled={isLoading}
        className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
      >
        <X className="w-4 h-4 mr-1" /> {t("reject")}
      </Button>
    </div>
  );
}
