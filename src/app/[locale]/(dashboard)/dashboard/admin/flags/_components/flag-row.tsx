"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { toggleFeatureFlagAction } from "@/actions/feature-flags";

type FlagRowProps = {
  name: string;
  enabled: boolean;
};

export function FlagRow({ name, enabled }: FlagRowProps) {
  const t = useTranslations("admin.flags");
  const [isPending, startTransition] = useTransition();

  const handleToggle = (checked: boolean) => {
    startTransition(async () => {
      try {
        await toggleFeatureFlagAction(name, checked);
      } catch (error) {
        console.error("Failed to update feature flag", error);
      }
    });
  };

  return (
    <div className="flex items-center justify-between p-4 border border-border/50 bg-card rounded-none">
      <div>
        <p className="font-medium font-serif text-lg">{name}</p>
        <p className="text-sm text-muted-foreground">{t("rowHint")}</p>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={isPending}
      />
    </div>
  );
}
