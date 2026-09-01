"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "../../_components/status-badge";
import { toggleFeatureFlagAction } from "@/actions/feature-flags";

export function FlagRow({
  name,
  enabled,
  description,
}: {
  name: string;
  enabled: boolean;
  /** What the flag actually gates - resolved by the page per known flag. */
  description: string;
}) {
  const t = useTranslations("admin.flags");
  const tCommon = useTranslations("common");
  const [isPending, startTransition] = useTransition();

  const handleToggle = (checked: boolean) => {
    startTransition(async () => {
      try {
        await toggleFeatureFlagAction(name, checked);
        toast.success(checked ? t("enabledToast") : t("disabledToast"));
      } catch (error) {
        toast.error(
          error instanceof Error && error.message
            ? error.message
            : tCommon("error"),
        );
      }
    });
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-sm font-medium text-foreground">
            {name}
          </code>
          <StatusBadge
            tone={enabled ? "positive" : "neutral"}
            label={enabled ? t("statusEnabled") : t("statusDisabled")}
          />
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={isPending}
        aria-label={name}
      />
    </div>
  );
}
