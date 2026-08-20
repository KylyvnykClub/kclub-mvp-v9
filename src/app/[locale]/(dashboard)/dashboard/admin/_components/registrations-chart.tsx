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

  const chartData = data.map((bucket) => ({
    ...bucket,
    label: dateFormatter.format(new Date(`${bucket.date}T00:00:00Z`)),
  }));

  return (
    <div className="h-64">
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
          <Tooltip cursor={{ fill: "hsl(var(--muted))" }} />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value) =>
              value === "members" ? membersLabel : companiesLabel
            }
          />
          <Bar
            dataKey="members"
            stackId="registrations"
            fill="hsl(var(--accent))"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="companies"
            stackId="registrations"
            fill="hsl(var(--muted-foreground))"
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
