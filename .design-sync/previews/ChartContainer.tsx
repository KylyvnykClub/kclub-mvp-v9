import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "kclub";

// The plot is a hand-drawn SVG on the global --chart-* tokens, and
// ChartContainer itself is deliberately NOT mounted: its ResponsiveContainer
// measures 0x0 in the static capture harness (initialDimension never
// applies), so anything inside it renders into a collapsed box - see the
// 2026-09-01 lesson in NOTES.md. This card shows what the chart family looks
// like in use; the real API lives in ChartContainer.d.ts / .prompt.md.
const SERIES = {
  members: { label: "Members", color: "var(--chart-1)" },
  companies: { label: "Companies", color: "var(--chart-2)" },
};

const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];
const MEMBERS = [14, 19, 12, 24, 21, 28];
const COMPANIES = [4, 6, 5, 8, 7, 9];
const MAX = 40;
const PLOT = { x: 36, w: 520, h: 190, base: 202 };

function StackedBar({ index }: { index: number }) {
  const slot = PLOT.w / MONTHS.length;
  const x = PLOT.x + index * slot + slot / 2 - 14;
  const mh = (MEMBERS[index] / MAX) * PLOT.h;
  const ch = (COMPANIES[index] / MAX) * PLOT.h;
  return (
    <g>
      <rect
        x={x}
        y={PLOT.base - mh}
        width={28}
        height={mh}
        fill={SERIES.members.color}
      />
      <rect
        x={x}
        y={PLOT.base - mh - 2 - ch}
        width={28}
        height={ch}
        rx={2}
        fill={SERIES.companies.color}
      />
      <text
        x={x + 14}
        y={PLOT.base + 18}
        textAnchor="middle"
        style={{
          font: "11px Manrope, sans-serif",
          fill: "var(--muted-foreground)",
        }}
      >
        {MONTHS[index]}
      </text>
    </g>
  );
}

export function RegistrationsChartCard() {
  return (
    <Card style={{ width: 640 }}>
      <CardHeader>
        <CardTitle style={{ fontSize: 16 }}>Registrations</CardTitle>
        <CardDescription>New members and companies per month.</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 16,
            paddingBottom: 8,
            font: "12px Manrope, sans-serif",
            color: "var(--foreground)",
          }}
        >
          {(["members", "companies"] as const).map((key) => (
            <span
              key={key}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: SERIES[key].color,
                }}
              />
              {SERIES[key].label}
            </span>
          ))}
        </div>
        <svg
          viewBox="0 0 570 226"
          style={{ width: "100%", height: "auto", display: "block" }}
          role="img"
          aria-label="Stacked bars of new members and companies per month"
        >
          {[0, 10, 20, 30, 40].map((v) => {
            const y = PLOT.base - (v / MAX) * PLOT.h;
            return (
              <g key={v}>
                <line
                  x1={PLOT.x}
                  x2={PLOT.x + PLOT.w}
                  y1={y}
                  y2={y}
                  stroke="var(--border)"
                  strokeOpacity={0.6}
                />
                <text
                  x={PLOT.x - 8}
                  y={y + 4}
                  textAnchor="end"
                  style={{
                    font: "11px Manrope, sans-serif",
                    fill: "var(--muted-foreground)",
                  }}
                >
                  {v}
                </text>
              </g>
            );
          })}
          {MONTHS.map((_, i) => (
            <StackedBar key={i} index={i} />
          ))}
        </svg>
      </CardContent>
    </Card>
  );
}
