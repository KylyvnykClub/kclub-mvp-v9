"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  approveCompanyChangesAction,
  getCompanyAdminDetailAction,
  hideCompanyAction,
  rejectCompanyChangesAction,
  setCompanyShowcaseAction,
  staffEditCompanyAction,
  unhideCompanyAction,
} from "@/actions/company";
import { AdminDetailSheet } from "../../_components/admin-detail-sheet";
import { StatusBadge, type StatusTone } from "../../_components/status-badge";

type CompanyDetail = NonNullable<
  Awaited<ReturnType<typeof getCompanyAdminDetailAction>>["data"]
>;

const STATUS_LABEL_KEYS = {
  pending: "statusPending",
  approved: "statusApproved",
  rejected: "statusRejected",
} as const;

const STATUS_TONES: Record<keyof typeof STATUS_LABEL_KEYS, StatusTone> = {
  pending: "warning",
  approved: "positive",
  rejected: "negative",
};

const REFERRAL_STATUS_KEYS = {
  pending_review: "refStatusPendingReview",
  rejected: "refStatusRejected",
  delivered: "refStatusDelivered",
  accepted: "refStatusAccepted",
  declined: "refStatusDeclined",
  expired: "refStatusExpired",
} as const;

const PENDING_CHANGE_LABEL_KEYS = {
  name: "colCompany",
  description: "descriptionLabel",
  discount: "discountLabel",
  businessCategoryId: "categoryLabel",
} as const;

/**
 * pendingChanges is jsonb, so what comes back is unknown. Strings and numbers
 * are what the owner edit form can actually produce; anything else is shown as
 * its JSON rather than as "[object Object]".
 */
function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

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
  if (value === null || value === undefined || value === "") return null;

  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

export function CompanyDetailSheet({
  companyId,
  companyName,
  canModerate,
}: {
  companyId: string;
  companyName: string;
  canModerate: boolean;
}) {
  const t = useTranslations("admin.companies");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [isPending, startTransition] = useTransition();

  // Edited fields live here only once the drawer has loaded, so the form is
  // never rendered against a company the staff member has not seen yet.
  const [edit, setEdit] = useState({
    discount: "",
    description: "",
    contactEmail: "",
    contactPhone: "",
  });
  const [showcaseType, setShowcaseType] = useState<"none" | "top" | "featured">(
    "none",
  );
  const [showcaseRank, setShowcaseRank] = useState("0");

  const load = () => {
    startTransition(async () => {
      const res = await getCompanyAdminDetailAction(companyId);

      if (!res.success || !res.data) {
        toast.error(t("actionFailed", { error: res.error ?? "" }));
        return;
      }

      setDetail(res.data);
      setEdit({
        discount: res.data.company.discount ?? "",
        description: res.data.company.description ?? "",
        contactEmail: res.data.company.contactEmail ?? "",
        contactPhone: res.data.company.contactPhone ?? "",
      });
      setShowcaseType(res.data.company.showcaseType);
      setShowcaseRank(String(res.data.company.showcaseRank));
    });
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && !detail) load();
  };

  /**
   * Every mutation reloads the drawer as well as the list behind it: the tabs
   * show state the action just changed, so refreshing only the page would
   * leave the open drawer showing what was true a moment ago.
   */
  const run = (
    work: () => Promise<{ success: boolean; error?: string }>,
    successMessage: string,
  ) => {
    startTransition(async () => {
      const res = await work();

      if (!res.success) {
        toast.error(t("actionFailed", { error: res.error ?? "" }));
        return;
      }

      toast.success(successMessage);
      load();
      router.refresh();
    });
  };

  const company = detail?.company;
  const pendingChanges = (company?.pendingChanges ?? null) as Record<
    string,
    unknown
  > | null;

  const loading = (
    <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>
  );

  const overviewTab = !company ? (
    loading
  ) : (
    <div className="space-y-6">
      <Section title={t("tabOverview")}>
        <div className="space-y-2">
          <Field
            label={t("colStatus")}
            value={
              <StatusBadge
                tone={STATUS_TONES[company.moderationStatus]}
                label={t(STATUS_LABEL_KEYS[company.moderationStatus])}
              />
            }
          />
          <Field label={t("ownerLabel")} value={company.owner?.displayName} />
          <Field
            label={t("categoryLabel")}
            value={
              company.categories
                ?.map(
                  (c) =>
                    `${c.businessCategory?.block} / ${c.businessCategory?.category}`,
                )
                .join(", ") || "—"
            }
          />
          <Field
            label={t("slugLabel")}
            value={<span className="font-mono text-xs">{company.slug}</span>}
          />
          <Field
            label={t("cityLabel")}
            value={[company.city, company.country].filter(Boolean).join(", ")}
          />
          <Field label={t("websiteLabel")} value={company.website} />
          <Field label={t("discountLabel")} value={company.discount} />
          <Field
            label={t("createdLabel")}
            value={new Date(company.createdAt).toLocaleDateString()}
          />
          <Field
            label={t("updatedLabel")}
            value={new Date(company.updatedAt).toLocaleDateString()}
          />
        </div>
      </Section>

      {company.description && (
        <Section title={t("descriptionLabel")}>
          <p className="text-sm text-muted-foreground">{company.description}</p>
        </Section>
      )}
    </div>
  );

  const profileTab = !company ? (
    loading
  ) : (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("profileHint")}</p>
      <div className="space-y-2">
        <Label htmlFor={`discount-${companyId}`}>{t("discountLabel")}</Label>
        <Input
          id={`discount-${companyId}`}
          value={edit.discount}
          onChange={(e) => setEdit({ ...edit, discount: e.target.value })}
          disabled={!canModerate}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`description-${companyId}`}>
          {t("descriptionLabel")}
        </Label>
        <Textarea
          id={`description-${companyId}`}
          rows={4}
          value={edit.description}
          onChange={(e) => setEdit({ ...edit, description: e.target.value })}
          disabled={!canModerate}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`email-${companyId}`}>{t("contactEmailLabel")}</Label>
        <Input
          id={`email-${companyId}`}
          type="email"
          value={edit.contactEmail}
          onChange={(e) => setEdit({ ...edit, contactEmail: e.target.value })}
          disabled={!canModerate}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`phone-${companyId}`}>{t("contactPhoneLabel")}</Label>
        <Input
          id={`phone-${companyId}`}
          value={edit.contactPhone}
          onChange={(e) => setEdit({ ...edit, contactPhone: e.target.value })}
          disabled={!canModerate}
        />
      </div>
      {canModerate && (
        <Button
          onClick={() =>
            run(() => staffEditCompanyAction(companyId, edit), t("saved"))
          }
          disabled={isPending}
        >
          {isPending ? tCommon("saving") : tCommon("save")}
        </Button>
      )}
    </div>
  );

  const moderationTab = !company ? (
    loading
  ) : (
    <div className="space-y-6">
      <Section title={t("moderationCurrent")}>
        <div className="space-y-3">
          <StatusBadge
            tone={STATUS_TONES[company.moderationStatus]}
            label={t(STATUS_LABEL_KEYS[company.moderationStatus])}
          />
          {company.rejectionReason && (
            <p className="text-sm text-muted-foreground">
              {company.rejectionReason}
            </p>
          )}
          {/*
            Hide and restore are the two directions between approved and
            rejected. A pending company belongs to the approve/reject queue
            instead - offering "restore to catalogue" there would describe an
            action that has never happened.
          */}
          {canModerate && company.moderationStatus === "approved" && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() =>
                run(() => hideCompanyAction(companyId), t("hidden"))
              }
              disabled={isPending}
            >
              {t("hide")}
            </Button>
          )}
          {canModerate && company.moderationStatus === "rejected" && (
            <Button
              size="sm"
              onClick={() =>
                run(() => unhideCompanyAction(companyId), t("unhidden"))
              }
              disabled={isPending}
            >
              {t("unhide")}
            </Button>
          )}
        </div>
      </Section>

      <Section title={t("pendingChangesTitle")}>
        {!pendingChanges || Object.keys(pendingChanges).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("noPendingChanges")}
          </p>
        ) : (
          <div className="space-y-3">
            {Object.entries(pendingChanges).map(([field, value]) => (
              <div
                key={field}
                className="rounded-md border border-border p-3 text-sm"
              >
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {field in PENDING_CHANGE_LABEL_KEYS
                    ? t(
                        PENDING_CHANGE_LABEL_KEYS[
                          field as keyof typeof PENDING_CHANGE_LABEL_KEYS
                        ],
                      )
                    : field}
                </p>
                <p className="mt-1 text-muted-foreground line-through">
                  {t("currentValue")}:{" "}
                  {formatChangeValue(
                    (company as unknown as Record<string, unknown>)[field],
                  )}
                </p>
                <p className="text-foreground">
                  {t("proposedValue")}: {formatChangeValue(value)}
                </p>
              </div>
            ))}
            {canModerate && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    run(
                      () => approveCompanyChangesAction(companyId),
                      t("changesApproved"),
                    )
                  }
                  disabled={isPending}
                >
                  {t("approveChanges")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    run(
                      () => rejectCompanyChangesAction(companyId),
                      t("changesRejected"),
                    )
                  }
                  disabled={isPending}
                >
                  {t("rejectChanges")}
                </Button>
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );

  const billingTab = !detail ? (
    loading
  ) : detail.subscriptions.length === 0 ? (
    <p className="text-sm text-muted-foreground">{t("noSubscriptions")}</p>
  ) : (
    <div className="space-y-2">
      {detail.subscriptions.map((subscription) => (
        <div
          key={subscription.id}
          className="rounded-md border border-border p-3 text-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-mono text-xs text-muted-foreground">
              {subscription.stripeSubscriptionId}
            </p>
            <Badge variant="outline">{subscription.status}</Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("priceLabel")}: {subscription.priceId}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("periodEnds")}:{" "}
            {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
          </p>
        </div>
      ))}
    </div>
  );

  const introsTab = !detail ? (
    loading
  ) : (
    <div className="space-y-4">
      <p className="text-sm font-medium">
        {t("introsTotal", {
          count: Object.values(detail.referralCounts).reduce(
            (sum, value) => sum + value,
            0,
          ),
        })}
      </p>
      <p className="text-xs text-muted-foreground">{t("introsPrivacyNote")}</p>
      {detail.referrals.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noIntros")}</p>
      ) : (
        <div className="space-y-2">
          {detail.referrals.map((referral) => (
            <div
              key={referral.id}
              className="rounded-md border border-border p-3 text-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {new Date(referral.createdAt).toLocaleDateString()}
                </p>
                <Badge variant="outline">
                  {t(REFERRAL_STATUS_KEYS[referral.status])}
                </Badge>
              </div>
              <p className="mt-1">
                {t("introService")}: {referral.serviceNeeded}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("introExpires")}:{" "}
                {new Date(referral.expiresAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const visibilityTab = !company ? (
    loading
  ) : (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("showcaseTypeLabel")}</Label>
        <Select
          value={showcaseType}
          onValueChange={(value: "none" | "top" | "featured") =>
            setShowcaseType(value)
          }
          disabled={!canModerate}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("showcaseNone")}</SelectItem>
            <SelectItem value="top">{t("showcaseTop")}</SelectItem>
            <SelectItem value="featured">{t("showcaseFeatured")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`rank-${companyId}`}>{t("showcaseRankLabel")}</Label>
        <Input
          id={`rank-${companyId}`}
          type="number"
          min={0}
          max={99}
          value={showcaseRank}
          onChange={(e) => setShowcaseRank(e.target.value)}
          disabled={!canModerate}
        />
      </div>
      {canModerate && (
        <Button
          onClick={() =>
            run(
              () =>
                setCompanyShowcaseAction(
                  companyId,
                  showcaseType,
                  Number(showcaseRank),
                ),
              t("showcaseSaved"),
            )
          }
          disabled={isPending}
        >
          {isPending ? tCommon("saving") : tCommon("save")}
        </Button>
      )}
    </div>
  );

  const historyTab = !detail ? (
    loading
  ) : detail.history.length === 0 ? (
    <p className="text-sm text-muted-foreground">{t("noHistory")}</p>
  ) : (
    <div className="space-y-2">
      {detail.history.map((entry) => (
        <div
          key={entry.id}
          className="rounded-md border border-border p-3 text-xs text-muted-foreground"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-foreground">{entry.action}</span>
            <span>{new Date(entry.createdAt).toLocaleString()}</span>
          </div>
          <p className="mt-1">{entry.actorType}</p>
        </div>
      ))}
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
      title={companyName}
      tabs={[
        { value: "overview", label: t("tabOverview"), content: overviewTab },
        { value: "profile", label: t("tabProfile"), content: profileTab },
        {
          value: "moderation",
          label: t("tabModeration"),
          content: moderationTab,
        },
        { value: "billing", label: t("tabBilling"), content: billingTab },
        { value: "intros", label: t("tabIntros"), content: introsTab },
        {
          value: "visibility",
          label: t("tabVisibility"),
          content: visibilityTab,
        },
        { value: "history", label: t("tabHistory"), content: historyTab },
      ]}
    />
  );
}
