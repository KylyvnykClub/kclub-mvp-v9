import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkline } from "./sparkline";

export function KpiCard({
  label,
  value,
  icon: Icon,
  footnote,
  sparklineValues,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  footnote?: string;
  sparklineValues?: number[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-2xl font-bold">{value}</div>
            {footnote && (
              <p className="mt-1 text-xs text-muted-foreground">{footnote}</p>
            )}
          </div>
          {sparklineValues && sparklineValues.length > 1 && (
            <Sparkline
              values={sparklineValues}
              width={72}
              height={28}
              className="shrink-0 text-accent"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
