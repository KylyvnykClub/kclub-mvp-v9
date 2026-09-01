"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { RegistrationsByDay } from "@/data/admin";

/**
 * Two series, fixed slot order: members are always chart-1, companies always
 * chart-2, whatever the period shows. The tinted totals use the same tokens
 * through color-mix so the boxes, the bars and the legend cannot disagree.
 */
const SERIES = {
  members: {
    color: "var(--chart-1)",
    track: "color-mix(in oklab, var(--chart-1) 14%, transparent)",
  },
  companies: {
    color: "var(--chart-2)",
    track: "color-mix(in oklab, var(--chart-2) 14%, transparent)",
  },
} as const;

export function RegistrationsChart({
  data,
  locale,
  membersLabel,
  companiesLabel,
}: {
  data: RegistrationsByDay[];
  locale: string;
  membersLabel: string;
  companiesLabel: string;
}) {
  const config = {
    members: { label: membersLabel, color: SERIES.members.color },
    companies: { label: companiesLabel, color: SERIES.companies.color },
  } satisfies ChartConfig;

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  });
  const longDateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
  });
  const numberFormatter = new Intl.NumberFormat(locale);
  const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

  const chartData = data.map((bucket) => ({
    ...bucket,
    total: bucket.members + bucket.companies,
  }));
  const totals = chartData.reduce(
    (acc, bucket) => ({
      members: acc.members + bucket.members,
      companies: acc.companies + bucket.companies,
    }),
    { members: 0, companies: 0 },
  );
  const maxDailyTotal = Math.max(...chartData.map((bucket) => bucket.total), 1);
  const latestDays = chartData.slice(-7).reverse();

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(220px,0.85fr)]">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {(["members", "companies"] as const).map((key) => (
            <div
              key={key}
              className="rounded-md border px-4 py-3"
              style={{
                borderColor: SERIES[key].track,
                backgroundColor: SERIES[key].track,
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: SERIES[key].color }}
                />
                <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {key === "members" ? membersLabel : companiesLabel}
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
                {numberFormatter.format(totals[key])}
              </p>
            </div>
          ))}
        </div>

        <ChartContainer config={config} className="aspect-auto h-72 w-full">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} strokeOpacity={0.6} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={40}
              tickFormatter={(value: string) =>
                dateFormatter.format(toDate(value))
              }
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value) =>
                    typeof value === "string"
                      ? longDateFormatter.format(toDate(value))
                      : null
                  }
                />
              }
            />
            <ChartLegend
              verticalAlign="top"
              content={<ChartLegendContent className="justify-end pb-4" />}
            />
            <Bar
              dataKey="members"
              stackId="registrations"
              fill="var(--color-members)"
              radius={[0, 0, 2, 2]}
            />
            <Bar
              dataKey="companies"
              stackId="registrations"
              fill="var(--color-companies)"
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </div>

      <div className="space-y-2 rounded-md border bg-muted/15 p-3">
        {latestDays.map((bucket) => (
          <div key={bucket.date} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {dateFormatter.format(toDate(bucket.date))}
              </span>
              <span className="font-mono text-xs text-foreground">
                {numberFormatter.format(bucket.total)}
              </span>
            </div>
            <div className="flex h-2 gap-px overflow-hidden rounded-full bg-border">
              <span
                className="h-full"
                style={{
                  width: `${(bucket.members / maxDailyTotal) * 100}%`,
                  backgroundColor: SERIES.members.color,
                }}
              />
              <span
                className="h-full"
                style={{
                  width: `${(bucket.companies / maxDailyTotal) * 100}%`,
                  backgroundColor: SERIES.companies.color,
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>
                {membersLabel}: {numberFormatter.format(bucket.members)}
              </span>
              <span>
                {companiesLabel}: {numberFormatter.format(bucket.companies)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
