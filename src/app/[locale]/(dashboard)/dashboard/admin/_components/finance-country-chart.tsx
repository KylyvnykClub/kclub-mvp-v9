"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COUNTRY_POINTS: Record<string, { x: number; y: number }> = {
  US: { x: 23, y: 42 },
  CA: { x: 22, y: 30 },
  MX: { x: 20, y: 51 },
  BR: { x: 35, y: 68 },
  GB: { x: 47, y: 36 },
  FR: { x: 49, y: 42 },
  DE: { x: 52, y: 39 },
  ES: { x: 47, y: 47 },
  IT: { x: 53, y: 47 },
  UA: { x: 59, y: 40 },
  PL: { x: 56, y: 38 },
  CZ: { x: 54, y: 41 },
  TR: { x: 60, y: 49 },
  AE: { x: 64, y: 57 },
  IN: { x: 68, y: 57 },
  CN: { x: 75, y: 47 },
  JP: { x: 86, y: 47 },
  AU: { x: 82, y: 75 },
};

type FinanceCountryChartProps = {
  revenueByCountry: Record<string, number>;
  locale: string;
  mapLabels: {
    ariaLabel: string;
    selected: string;
    unknownCountry: string;
  };
};

export function FinanceCountryChart({
  revenueByCountry,
  locale,
  mapLabels,
}: FinanceCountryChartProps) {
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  });
  const countryNames = useMemo(
    () => new Intl.DisplayNames(locale, { type: "region" }),
    [locale],
  );

  const chartData = Object.entries(revenueByCountry)
    .map(([country, amount]) => ({
      country,
      amount,
      label:
        country === "Unknown"
          ? mapLabels.unknownCountry
          : (countryNames.of(country) ?? country),
    }))
    .sort((a, b) => b.amount - a.amount);

  const maxAmount = Math.max(...chartData.map((item) => item.amount), 1);
  const activeCountry = hoveredCountry ?? selectedCountry;
  const activeItem = chartData.find((item) => item.country === activeCountry);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
      <div
        className="relative h-64 overflow-hidden rounded-md border bg-muted/20"
        aria-label={mapLabels.ariaLabel}
        role="group"
      >
        <svg viewBox="0 0 100 60" className="h-full w-full" aria-hidden="true">
          <path
            d="M8 23c6-7 19-10 27-6 5 3 7 8 3 12-3 4-12 2-16 7-5 6-16 0-14-13Zm39-9c9-5 24-4 31 3 5 6 4 14-4 17-7 3-13-2-19 0-9 3-18-13-8-20Zm4 31c10-5 23-2 26 7 2 7-5 12-15 10-12-2-23-10-11-17Z"
            className="fill-zinc-200 stroke-zinc-300 dark:fill-zinc-800 dark:stroke-zinc-700"
            strokeWidth="0.5"
          />
        </svg>

        {chartData
          .filter((item) => COUNTRY_POINTS[item.country])
          .map((item) => {
            const point = COUNTRY_POINTS[item.country] ?? { x: 50, y: 35 };
            const radius = 2.5 + (item.amount / maxAmount) * 5;
            const active = item.country === activeCountry;

            return (
              <button
                key={item.country}
                type="button"
                aria-pressed={item.country === selectedCountry}
                aria-label={`${item.label}: ${formatter.format(item.amount / 100)}`}
                onClick={() =>
                  setSelectedCountry((current) =>
                    current === item.country ? null : item.country,
                  )
                }
                onMouseEnter={() => setHoveredCountry(item.country)}
                onMouseLeave={() => setHoveredCountry(null)}
                onFocus={() => setHoveredCountry(item.country)}
                onBlur={() => setHoveredCountry(null)}
                className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  active
                    ? "z-10 scale-125 border-foreground bg-accent"
                    : "border-accent bg-accent/35 hover:scale-110"
                }`}
                style={{
                  left: `${point.x}%`,
                  top: `${(point.y / 60) * 100}%`,
                  width: `${radius * 2.4}px`,
                  height: `${radius * 2.4}px`,
                }}
              >
                <span className="sr-only">{item.label}</span>
              </button>
            );
          })}

        {activeItem && (
          <div className="absolute bottom-3 left-3 rounded-md border border-border bg-background/95 px-3 py-2 text-xs shadow-sm">
            <p className="font-medium text-foreground">{activeItem.label}</p>
            <p className="font-mono text-muted-foreground">
              {formatter.format(activeItem.amount / 100)}
              {selectedCountry === activeItem.country
                ? ` · ${mapLabels.selected}`
                : ""}
            </p>
          </div>
        )}
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <XAxis
              type="number"
              tickFormatter={(value: number) => formatter.format(value / 100)}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              dataKey="label"
              type="category"
              width={54}
              tick={{ fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value) =>
                typeof value === "number"
                  ? formatter.format(value / 100)
                  : String(value ?? "")
              }
              cursor={{ fill: "hsl(var(--muted))" }}
            />
            <Bar dataKey="amount" radius={2}>
              {chartData.map((item) => (
                <Cell
                  key={item.country}
                  fill={
                    item.country === selectedCountry
                      ? "hsl(var(--accent))"
                      : "hsl(var(--foreground))"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
