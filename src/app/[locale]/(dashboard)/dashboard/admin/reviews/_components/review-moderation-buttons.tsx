"use client";

// Client: the buttons call the moderation action and refresh the queue in
// place, keeping the filter and the page (FR-129).
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { moderateReviewAction } from "@/actions/reviews";
import { Button } from "@/components/ui/button";

export function ReviewModerationButtons({
  reviewId,
  status,
}: {
  reviewId: string;
  status: "pending" | "approved" | "rejected";
}) {
  const t = useTranslations("admin.reviews");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const decide = (decision: "approved" | "rejected") =>
    startTransition(async () => {
      const result = await moderateReviewAction({ reviewId, decision });
      if (!result.success) {
        toast.error(t("actionFailed"));
        return;
      }
      toast.success(decision === "approved" ? t("approved") : t("rejected"));
      router.refresh();
    });

  return (
    <div className="flex justify-end gap-2">
      {status !== "approved" && (
        <Button size="sm" onClick={() => decide("approved")} disabled={pending}>
          {t("approve")}
        </Button>
      )}
      {status !== "rejected" && (
        <Button
          size="sm"
          variant="destructive"
          onClick={() => decide("rejected")}
          disabled={pending}
        >
          {t("reject")}
        </Button>
      )}
    </div>
  );
}
