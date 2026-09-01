import type { LucideIcon } from "lucide-react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatTrend = "up" | "down" | "flat";

/**
 * `label` arrives already formatted ("+12.5%") - the caller owns the number
 * formatting and the locale. `trend` only picks the icon and the tone.
 */
export interface StatDelta {
  label: string;
  trend: StatTrend;
}

const TREND_ICON: Record<StatTrend, LucideIcon> = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

const TREND_VARIANT = {
  up: "success",
  down: "destructive",
  flat: "outline",
} as const;

/**
 * One number a staff member glances at. Composition ported from the donor
 * metric card: icon in a bordered square, muted label, large tabular value,
 * optional delta badge, optional footnote. No sparkline - a tile that needs
 * a trend line is a chart, and belongs in a `ConsoleSection`.
 */
export function StatTile({
  label,
  value,
  icon: Icon,
  footnote,
  delta,
  className,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  footnote?: string;
  delta?: StatDelta;
  className?: string;
}) {
  const TrendIcon = delta ? TREND_ICON[delta.trend] : null;

  return (
    <Card className={cn("bg-linear-to-t from-primary/5 to-card", className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 p-5 pb-3">
        <p className="min-w-0 truncate text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 p-5 pt-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-3xl font-bold leading-none tracking-tight tabular-nums">
            {value}
          </div>
          {delta && TrendIcon && (
            <Badge
              variant={TREND_VARIANT[delta.trend]}
              className="gap-1 font-sans normal-case tracking-normal"
            >
              <TrendIcon className="size-3" aria-hidden="true" />
              {delta.label}
            </Badge>
          )}
        </div>
        {footnote && (
          <p className="text-sm text-muted-foreground">{footnote}</p>
        )}
      </CardContent>
    </Card>
  );
}
