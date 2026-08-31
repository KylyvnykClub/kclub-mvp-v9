import type { ReactNode } from "react";

/**
 * The rule-and-eyebrow header every section on the partner page shares. `count`
 * is the monospace tally on the right, used where a section renders a list
 * whose length is worth stating up front.
 */
export function SectionHeader({
  label,
  count,
}: {
  label: string;
  count?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
      <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      {count !== undefined && (
        <span className="font-mono text-xs text-muted-foreground">{count}</span>
      )}
    </div>
  );
}

export function HowToSteps({
  steps,
}: {
  steps: { num: string; title: string; note: string }[];
}) {
  return (
    <div className="mt-4 grid divide-y divide-border rounded-lg border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {steps.map((step) => (
        <div key={step.num} className="flex flex-col gap-2 p-5">
          <span className="font-mono text-xs text-accent-ink">{step.num}</span>
          <span className="text-sm text-foreground">{step.title}</span>
          <span className="text-[12.5px] leading-relaxed text-muted-foreground">
            {step.note}
          </span>
        </div>
      ))}
    </div>
  );
}
