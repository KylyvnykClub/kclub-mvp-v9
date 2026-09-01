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
  COUNTRY_POSITIONS,
  MAP_DOTS,
  MAP_HEIGHT,
  MAP_STEP,
  MAP_WIDTH,
} from "./dotted-world-map";

/**
 * The land dots as a single <path>. 1365 separate <circle> elements would be
 * 1365 DOM nodes that never change; one path is one node. Built once at module
 * scope because the map is the same on every render and for every viewer.
 */
const DOT_RADIUS = MAP_STEP * 0.36;
const LAND_PATH = (() => {
  const parts: string[] = [];
  for (let i = 0; i < MAP_DOTS.length; i += 2) {
    const x = MAP_DOTS[i]!;
    const y = MAP_DOTS[i + 1]!;
    parts.push(
      `M${x - DOT_RADIUS} ${y}a${DOT_RADIUS} ${DOT_RADIUS} 0 1 0 ${DOT_RADIUS * 2} 0a${DOT_RADIUS} ${DOT_RADIUS} 0 1 0 ${-DOT_RADIUS * 2} 0`,
    );
  }
  return parts.join("");
})();

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
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          className="h-full w-full"
        >
          {/* Land. Decorative: the countries carrying revenue are the pins
              below, and each of those has its own accessible name. */}
          <path
            d={LAND_PATH}
            className="fill-zinc-300 dark:fill-zinc-700"
            aria-hidden="true"
          />

          {chartData
            .filter((item) => COUNTRY_POSITIONS[item.country])
            .map((item) => {
              const [x, y] = COUNTRY_POSITIONS[item.country]!;
              const share = item.amount / maxAmount;
              const radius = MAP_STEP * (0.9 + share * 1.1);
              const active = item.country === activeCountry;

              return (
                <g key={item.country}>
                  {/* A halo, so a pin on a dense part of the grid still reads
                      as a marker rather than as a slightly larger dot. */}
                  <circle
                    cx={x}
                    cy={y}
                    r={radius * 2.1}
                    className="fill-accent/20"
                    aria-hidden="true"
                  />
                  <circle
                    role="button"
                    tabIndex={0}
                    aria-pressed={item.country === selectedCountry}
                    aria-label={`${item.label}: ${formatter.format(item.amount / 100)}`}
                    cx={x}
                    cy={y}
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
                    // Tailwind classes rather than style={{ fill: "hsl(var(--accent))" }}.
                    // The theme tokens are oklch, so wrapping them in hsl()
                    // produces an invalid colour and the browser falls back to
                    // black - which is what the previous version did to the
                    // selected pin.
                    className={`cursor-pointer stroke-background transition-all focus-visible:outline-none ${
                      active ? "fill-foreground" : "fill-accent"
                    }`}
                    style={{ strokeWidth: MAP_STEP * 0.4 }}
                  />
                </g>
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
                cursor={{ fill: "var(--muted)" }}
              />
              <Bar dataKey="amount" radius={2}>
                {chartData.map((item) => (
                  <Cell
                    key={item.country}
                    fill={
                      item.country === selectedCountry
                        ? "var(--accent)"
                        : "var(--foreground)"
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
