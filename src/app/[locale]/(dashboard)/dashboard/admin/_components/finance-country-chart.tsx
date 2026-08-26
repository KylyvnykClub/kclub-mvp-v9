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
    noData: string;
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
  const hasData = chartData.length > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
      <div
        className="relative h-64 overflow-hidden rounded-md border bg-muted/20"
        aria-label={mapLabels.ariaLabel}
        role="group"
      >
        <svg viewBox="0 0 100 60" className="h-full w-full" aria-hidden="true">
          <path
            d="M4 30h92M50 4v52M10 14c18 6 62 6 80 0M10 46c18-6 62-6 80 0M18 8c-7 11-7 33 0 44M82 8c7 11 7 33 0 44"
            className="fill-none stroke-zinc-200 dark:stroke-zinc-800"
            strokeWidth="0.35"
          />
          <path
            d="M8 18c4-6 12-8 18-7 5 1 8 4 9 8 1 3-1 5-5 6-3 1-5 1-7 4-3 4-7 6-11 3-4-2-7-8-4-14Z"
            className="fill-zinc-200 stroke-zinc-300 dark:fill-zinc-800 dark:stroke-zinc-700"
            strokeWidth="0.45"
          />
          <path
            d="M27 35c5 1 9 5 10 10 1 6-3 11-6 12-4-5-8-12-8-17 0-3 1-5 4-5Z"
            className="fill-zinc-200 stroke-zinc-300 dark:fill-zinc-800 dark:stroke-zinc-700"
            strokeWidth="0.45"
          />
          <path
            d="M42 16c5-5 15-7 24-5 12 2 22 8 25 16 2 6-2 9-10 8-7-1-11-4-17-1-6 3-12 2-17-3-5-4-9-10-5-15Z"
            className="fill-zinc-200 stroke-zinc-300 dark:fill-zinc-800 dark:stroke-zinc-700"
            strokeWidth="0.45"
          />
          <path
            d="M50 32c8-3 18 2 19 10 1 6-4 10-11 9-8-1-15-6-14-12 0-3 2-5 6-7Z"
            className="fill-zinc-200 stroke-zinc-300 dark:fill-zinc-800 dark:stroke-zinc-700"
            strokeWidth="0.45"
          />
          <path
            d="M77 44c5-3 11-1 14 4 2 4 0 7-5 7-6 0-12-3-12-7 0-1 1-3 3-4Z"
            className="fill-zinc-200 stroke-zinc-300 dark:fill-zinc-800 dark:stroke-zinc-700"
            strokeWidth="0.45"
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
        {hasData ? (
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
        ) : (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            {mapLabels.noData}
          </div>
        )}
      </div>
    </div>
  );
}
