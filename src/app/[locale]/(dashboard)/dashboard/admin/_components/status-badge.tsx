import { cn } from "@/lib/utils";

export type StatusTone = "positive" | "warning" | "negative" | "neutral";

const TONE_CLASSES: Record<StatusTone, string> = {
  positive: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  negative: "bg-destructive/15 text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

export function StatusBadge({
  tone,
  label,
  className,
}: {
  tone: StatusTone;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Tone per member status. Kept next to the badge rather than in each screen so
 * the list, the drawer and any later screen cannot drift apart on what
 * "blocked" looks like.
 */
export function memberStatusTone(status: string): StatusTone {
  if (status === "blocked") return "negative";
  if (status === "pending_deletion") return "warning";
  return "positive";
}
