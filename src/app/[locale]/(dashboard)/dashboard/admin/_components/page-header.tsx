import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one page title of a console screen. The topbar carries the breadcrumb
 * (console › section) and nothing else, so this `h1` is never duplicated
 * above it. `actions` is for the controls that apply to the whole screen -
 * a period switcher, a primary button - not for per-row actions.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-4",
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
