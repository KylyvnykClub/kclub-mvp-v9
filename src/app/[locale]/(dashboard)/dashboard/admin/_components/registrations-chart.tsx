"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RegistrationsByDay } from "@/data/admin";

const SERIES = {
  members: {
    color: "#d4af37",
    track: "rgba(212, 175, 55, 0.18)",
  },
  companies: {
    color: "#38bdf8",
    track: "rgba(56, 189, 248, 0.16)",
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
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  });

  const numberFormatter = new Intl.NumberFormat(locale);
  const chartData = data.map((bucket) => ({
    ...bucket,
    label: dateFormatter.format(new Date(`${bucket.date}T00:00:00Z`)),
  }));
  const totals = chartData.reduce(
    (acc, bucket) => ({
      members: acc.members + bucket.members,
      companies: acc.companies + bucket.companies,
    }),
    { members: 0, companies: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div
          className="rounded-md border px-4 py-3"
          style={{
            borderColor: SERIES.members.track,
            backgroundColor: SERIES.members.track,
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: SERIES.members.color }}
            />
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {membersLabel}
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {numberFormatter.format(totals.members)}
          </p>
        </div>
        <div
          className="rounded-md border px-4 py-3"
          style={{
            borderColor: SERIES.companies.track,
            backgroundColor: SERIES.companies.track,
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: SERIES.companies.color }}
            />
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {companiesLabel}
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {numberFormatter.format(totals.companies)}
          </p>
        </div>
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))" }}
              formatter={(value, name) => [
                numberFormatter.format(Number(value)),
                name === "members" ? membersLabel : companiesLabel,
              ]}
              labelStyle={{ color: "hsl(var(--foreground))" }}
              contentStyle={{
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                background: "hsl(var(--background))",
                color: "hsl(var(--foreground))",
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(value) =>
                value === "members" ? membersLabel : companiesLabel
              }
            />
            <Bar
              dataKey="members"
              stackId="registrations"
              fill={SERIES.members.color}
              radius={[0, 0, 2, 2]}
            />
            <Bar
              dataKey="companies"
              stackId="registrations"
              fill={SERIES.companies.color}
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
