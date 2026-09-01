"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export interface RevenueByDay {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** Major units, as the dashboard action already returns them. */
  amount: number;
}

/**
 * One series, so no legend - the section title names it. The tooltip is the
 * hover layer; the y-axis is compact currency so a 90-day range still reads.
 */
export function RevenueChart({
  data,
  locale,
  currency,
  label,
}: {
  data: RevenueByDay[];
  locale: string;
  currency: string;
  label: string;
}) {
  const config = {
    amount: { label, color: "var(--chart-1)" },
  } satisfies ChartConfig;

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  });
  const longDateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
  });
  const currencyFormatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  });
  const axisFormatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 0,
  });
  const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor="var(--color-amount)"
              stopOpacity={0.32}
            />
            <stop
              offset="95%"
              stopColor="var(--color-amount)"
              stopOpacity={0.03}
            />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeOpacity={0.6} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={40}
          tickFormatter={(value: string) => dateFormatter.format(toDate(value))}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(value: number) => axisFormatter.format(value)}
        />
        <ChartTooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={
            <ChartTooltipContent
              indicator="line"
              labelFormatter={(value) =>
                typeof value === "string"
                  ? longDateFormatter.format(toDate(value))
                  : null
              }
              formatter={(value) => (
                <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono font-medium text-foreground tabular-nums">
                    {currencyFormatter.format(Number(value))}
                  </span>
                </div>
              )}
            />
          }
        />
        <Area
          dataKey="amount"
          type="monotone"
          fill="url(#fillRevenue)"
          stroke="var(--color-amount)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
        />
      </AreaChart>
    </ChartContainer>
  );
}
