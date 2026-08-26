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

import {
  WORLD_COUNTRIES,
  WORLD_MAP_HEIGHT,
  WORLD_MAP_WIDTH,
} from "./world-map-paths";

const COUNTRY_POINTS: Map<string, { x: number; y: number }> = new Map(
  WORLD_COUNTRIES.map((country) => [
    country.id,
    { x: country.x, y: country.y },
  ]),
);

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
  const amountByCountry = new Map(
    chartData.map((item) => [item.country, item.amount]),
  );
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
        <svg
          viewBox={`0 0 ${WORLD_MAP_WIDTH} ${WORLD_MAP_HEIGHT}`}
          className="h-full w-full"
        >
          <path
            d={`M5 ${WORLD_MAP_HEIGHT / 2}h90M50 3v${WORLD_MAP_HEIGHT - 6}M11 ${WORLD_MAP_HEIGHT * 0.25}c18 4 60 4 78 0M11 ${WORLD_MAP_HEIGHT * 0.75}c18-4 60-4 78 0`}
            className="fill-none stroke-zinc-200/70 dark:stroke-zinc-800/70"
            strokeWidth="0.35"
            aria-hidden="true"
          />
          <g strokeWidth="0.14" strokeLinejoin="round" aria-hidden="true">
            {WORLD_COUNTRIES.map((country) => {
              const amount = amountByCountry.get(country.id) ?? 0;
              const active = country.id === activeCountry;
              const intensity = Math.min(amount / maxAmount, 1);
              const fill =
                !active && amount > 0
                  ? `rgba(212, 175, 55, ${0.28 + intensity * 0.48})`
                  : undefined;

              return (
                <path
                  key={country.id}
                  d={country.d}
                  className={
                    active
                      ? "fill-accent stroke-accent-foreground"
                      : "fill-zinc-200 stroke-zinc-300 dark:fill-zinc-800 dark:stroke-zinc-700"
                  }
                  style={{ fill }}
                />
              );
            })}
          </g>

          {chartData
            .filter((item) => COUNTRY_POINTS.has(item.country))
            .map((item) => {
              const point = COUNTRY_POINTS.get(item.country) ?? {
                x: WORLD_MAP_WIDTH / 2,
                y: WORLD_MAP_HEIGHT / 2,
              };
              const radius = 0.55 + (item.amount / maxAmount) * 1.15;
              const active = item.country === activeCountry;

              return (
                <circle
                  key={item.country}
                  role="button"
                  tabIndex={0}
                  aria-pressed={item.country === selectedCountry}
                  aria-label={`${item.label}: ${formatter.format(item.amount / 100)}`}
                  cx={point.x}
                  cy={point.y}
                  r={radius}
                  onClick={() =>
                    setSelectedCountry((current) =>
                      current === item.country ? null : item.country,
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedCountry((current) =>
                        current === item.country ? null : item.country,
                      );
                    }
                  }}
                  onMouseEnter={() => setHoveredCountry(item.country)}
                  onMouseLeave={() => setHoveredCountry(null)}
                  onFocus={() => setHoveredCountry(item.country)}
                  onBlur={() => setHoveredCountry(null)}
                  className="cursor-pointer transition-transform focus-visible:outline-none"
                  style={{
                    fill: active
                      ? "hsl(var(--accent))"
                      : "rgba(212, 175, 55, 0.62)",
                    stroke: active
                      ? "hsl(var(--foreground))"
                      : "hsl(var(--background))",
                    strokeWidth: active ? 0.42 : 0.32,
                  }}
                />
              );
            })}
        </svg>

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
