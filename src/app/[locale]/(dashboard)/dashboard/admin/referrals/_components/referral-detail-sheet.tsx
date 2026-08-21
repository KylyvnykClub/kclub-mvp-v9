"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  barReferralSenderAction,
  getReferralDetailAction,
  moderateReferralAction,
} from "@/actions/referral";
import type {
  ReferralAdminDetail,
  ReferralAdminStatus,
  ReferralAdminView,
} from "@/data/referrals";
import { AdminDetailSheet } from "../../_components/admin-detail-sheet";
import { StatusBadge, type StatusTone } from "../../_components/status-badge";

export const REFERRAL_STATUS_TONES: Record<ReferralAdminStatus, StatusTone> = {
  pending_review: "warning",
  delivered: "positive",
  accepted: "positive",
  declined: "neutral",
  rejected: "negative",
  expired: "neutral",
};

/**
 * FR-077: the client's name and contact channel are removed once an
 * introduction is rejected or expires. The drawer says so rather than
 * rendering the tombstone value as if it were a name.
 */
const REDACTED_STATUSES: ReferralAdminStatus[] = ["rejected", "expired"];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h4 className="border-b border-border pb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

export function ReferralDetailSheet({
  referral,
  canApprove,
  canReject,
}: {
  referral: ReferralAdminView;
  canApprove: boolean;
  canReject: boolean;
}) {
  const t = useTranslations("admin.referrals");
  const tr = useTranslations("Referral");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ReferralAdminDetail | null>(null);
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  const status = referral.status;
  const isRedacted = REDACTED_STATUSES.includes(status);
  const isPendingReview = status === "pending_review";

  /**
   * The client's details arrive only when a moderator opens this row. They are
   * not part of the list query, so they are never serialised into the page
   * payload for rows nobody looked at.
   */
  const load = () => {
    startTransition(async () => {
      const res = await getReferralDetailAction(referral.id);

      if (!res) {
        toast.error(tCommon("error"));
        return;
      }

      setDetail(res);
    });
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && !detail) load();
  };

  const run = (work: () => Promise<void>, successMessage: string) => {
    startTransition(async () => {
      try {
        await work();
        toast.success(successMessage);
        setReason("");
        setOpen(false);
        router.refresh();
      } catch {
        toast.error(tCommon("error"));
      }
    });
  };

  const handleModerate = (action: "approve" | "reject") => {
    if (action === "reject" && !reason) {
      toast.error(tr("rejectReasonRequired"));
      return;
    }

    run(
      () =>
        moderateReferralAction(
          referral.id,
          action,
          action === "reject" ? reason : undefined,
        ),
      action === "approve" ? tr("approvedToast") : tr("rejectedToast"),
    );
  };

  const handleBarSender = () => {
    if (!reason) {
      toast.error(tr("barReasonRequired"));
      return;
    }

    const barred = detail?.sender?.canSendReferrals ?? true;
    run(
      () => barReferralSenderAction(referral.senderId, barred, reason),
      barred ? tr("barredToast") : tr("unbarredToast"),
    );
  };

  const loading = (
    <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>
  );

  const overviewTab = (
    <div className="space-y-6">
      <Section title={t("tabOverview")}>
        <div className="space-y-2">
          <Field
            label={t("colStatus")}
            value={
              <StatusBadge
                tone={REFERRAL_STATUS_TONES[status]}
                label={tr(`status.${status}`)}
              />
            }
          />
          <Field
            label={t("senderLabel")}
            value={referral.sender?.displayName ?? tr("unknown")}
          />
          <Field
            label={t("companyLabel")}
            value={referral.recipientCompany?.name ?? tr("unknown")}
          />
        </div>
      </Section>

      {/*
        A timeline derived from the columns that already exist - no event table
        was added for a screen that only needs three dates.
      */}
      <Section title={t("timelineTitle")}>
        <div className="space-y-2">
          <Field
            label={t("createdLabel")}
            value={new Date(referral.createdAt).toLocaleString()}
          />
          {detail && (
            <Field
              label={t("moderatedLabel")}
              value={new Date(detail.updatedAt).toLocaleString()}
            />
          )}
          <Field
            label={t("expiresLabel")}
            value={new Date(referral.expiresAt).toLocaleDateString()}
          />
          {detail?.moderatorId && (
            <Field
              label={t("moderatorLabel")}
              value={
                <span className="font-mono text-xs">{detail.moderatorId}</span>
              }
            />
          )}
        </div>
      </Section>
    </div>
  );

  const contactTab = !detail ? (
    loading
  ) : (
    <div className="space-y-6">
      <Section title={t("tabContact")}>
        {isRedacted ? (
          <p className="text-sm text-muted-foreground">{t("redactedNotice")}</p>
        ) : (
          <div className="space-y-2">
            <Field label={t("clientNameLabel")} value={detail.clientName} />
            <Field
              label={t("contactChannelLabel")}
              value={detail.contactChannel ?? "-"}
            />
          </div>
        )}
      </Section>

      <Section title={t("consentSection")}>
        <div className="space-y-2">
          <Field
            label={t("consentLabel")}
            value={detail.consentAttested ? t("consentYes") : t("consentNo")}
          />
          {detail.consentTimestamp && (
            <Field
              label={t("consentTimestampLabel")}
              value={new Date(detail.consentTimestamp).toLocaleString()}
            />
          )}
        </div>
      </Section>
    </div>
  );

  const processingTab = (
    <div className="space-y-6">
      <Section title={t("tabProcessing")}>
        {!isPendingReview ? (
          <p className="text-sm text-muted-foreground">
            {t("onlyPendingNotice")}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor={`reason-${referral.id}`}>
                {t("reasonLabel")}
              </Label>
              <Input
                id={`reason-${referral.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={tr("rejectReasonPlaceholder")}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {canApprove && (
                <Button
                  size="sm"
                  onClick={() => handleModerate("approve")}
                  disabled={isPending}
                >
                  {tr("approve")}
                </Button>
              )}
              {canReject && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleModerate("reject")}
                  disabled={isPending}
                >
                  {tr("reject")}
                </Button>
              )}
            </div>
          </div>
        )}
      </Section>

      <Section title={t("senderPermission")}>
        {!detail ? (
          loading
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {detail.sender?.canSendReferrals
                ? t("senderCanSend")
                : t("senderBarred")}
            </p>
            {canReject && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBarSender}
                disabled={isPending}
              >
                {detail.sender?.canSendReferrals
                  ? tr("barSender")
                  : tr("unbarSender")}
              </Button>
            )}
          </div>
        )}
      </Section>
    </div>
  );

  const notesTab = !detail ? (
    loading
  ) : (
    <div className="space-y-6">
      <Section title={t("serviceLabel")}>
        <p className="text-sm">{detail.serviceNeeded}</p>
      </Section>
      <Section title={t("noteLabel")}>
        <p className="text-sm text-muted-foreground">
          {detail.note || t("noNote")}
        </p>
      </Section>
      <Section title={t("moderationReasonLabel")}>
        <p className="text-sm text-muted-foreground">
          {detail.moderationReason || t("noModerationReason")}
        </p>
      </Section>
    </div>
  );

  return (
    <AdminDetailSheet
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <SheetTrigger asChild>
          <Button variant="outline" size="sm">
            {t("details")}
          </Button>
        </SheetTrigger>
      }
      title={referral.recipientCompany?.name ?? tr("unknown")}
      description={new Date(referral.createdAt).toLocaleDateString()}
      tabs={[
        { value: "overview", label: t("tabOverview"), content: overviewTab },
        { value: "contact", label: t("tabContact"), content: contactTab },
        {
          value: "processing",
          label: t("tabProcessing"),
          content: processingTab,
        },
        { value: "notes", label: t("tabNotes"), content: notesTab },
      ]}
    />
  );
}
