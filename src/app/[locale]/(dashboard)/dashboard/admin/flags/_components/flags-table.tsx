"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toggleFeatureFlagAction } from "@/actions/feature-flags";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

type FeatureFlag = {
  name: string;
  enabled: boolean;
  updatedAt: Date;
};

export function FlagsTable({ initialFlags }: { initialFlags: FeatureFlag[] }) {
  const t = useTranslations("admin.flags");
  const [flags, setFlags] = useState(initialFlags);
  const [isPending, startTransition] = useTransition();

  const handleToggle = (name: string, currentEnabled: boolean) => {
    const newEnabled = !currentEnabled;

    // Optimistic update
    setFlags((prev) =>
      prev.map((f) => (f.name === name ? { ...f, enabled: newEnabled } : f)),
    );

    startTransition(async () => {
      try {
        await toggleFeatureFlagAction(name, newEnabled);
      } catch (e) {
        // Revert on error
        setFlags((prev) =>
          prev.map((f) =>
            f.name === name ? { ...f, enabled: currentEnabled } : f,
          ),
        );
        console.error("Failed to toggle feature flag", e);
      }
    });
  };

  return (
    <div className="border border-border/50 overflow-hidden bg-card/30 rounded-lg">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border/50 bg-muted/50">
              <th className="p-4 font-medium text-sm text-muted-foreground uppercase tracking-wider">
                {t("colName")}
              </th>
              <th className="p-4 font-medium text-sm text-muted-foreground uppercase tracking-wider">
                {t("colStatus")}
              </th>
              <th className="p-4 font-medium text-sm text-muted-foreground uppercase tracking-wider">
                {t("colUpdated")}
              </th>
              <th className="p-4 font-medium text-sm text-muted-foreground uppercase tracking-wider text-right">
                {t("colToggle")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 bg-card/30">
            {flags.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="p-8 text-center text-muted-foreground"
                >
                  {t("empty")}
                </td>
              </tr>
            ) : (
              flags.map((flag) => (
                <tr
                  key={flag.name}
                  className="hover:bg-muted/20 transition-colors"
                >
                  <td className="p-4 font-mono text-sm font-medium">
                    {flag.name}
                  </td>
                  <td className="p-4">
                    <Badge variant={flag.enabled ? "default" : "secondary"}>
                      {flag.enabled ? t("statusEnabled") : t("statusDisabled")}
                    </Badge>
                  </td>
                  <td className="p-4 text-sm text-muted-foreground">
                    {flag.updatedAt.toLocaleString()}
                  </td>
                  <td className="p-4 text-right">
                    <Switch
                      checked={flag.enabled}
                      disabled={isPending}
                      onCheckedChange={() =>
                        handleToggle(flag.name, flag.enabled)
                      }
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
