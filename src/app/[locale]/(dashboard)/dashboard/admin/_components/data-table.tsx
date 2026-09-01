import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * The list screens share one frame: a toolbar (search on the left, the count
 * on the right), a row of filter chips, the table, and the pagination footer.
 * Screens compose their own `TableHeader`/`TableBody` inside `DataTable`;
 * this file only fixes where things sit and how dense they are.
 */
export function DataTableShell({
  toolbar,
  summary,
  filters,
  footer,
  children,
  className,
}: {
  /** Search form or other primary control, left side. */
  toolbar?: ReactNode;
  /** Already-formatted count text ("42 members"), right side. */
  summary?: string;
  /** Filter chip rows. */
  filters?: ReactNode;
  /** Pagination. Rendered only when present. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      {(toolbar || summary) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">{toolbar}</div>
          {summary && (
            <p className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
              {summary}
            </p>
          )}
        </div>
      )}
      {filters && (
        <div className="space-y-2 border-b border-border bg-muted/30 px-4 py-3">
          {filters}
        </div>
      )}
      {children}
      {footer && <div className="px-4 pb-4">{footer}</div>}
    </Card>
  );
}

/**
 * Bounded scroll area so the sticky header has something to stick to; denser
 * rows than the default `Table` because a list screen is read, not filled in.
 */
export function DataTable({
  children,
  className,
  containerClassName,
}: {
  children: ReactNode;
  className?: string;
  containerClassName?: string;
}) {
  return (
    <Table
      containerClassName={cn("max-h-[70vh]", containerClassName)}
      className={cn("[&_td]:px-4 [&_td]:py-3 [&_th]:px-4", className)}
    >
      {children}
    </Table>
  );
}

export function DataTableHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <TableHeader
      className={cn(
        "sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--border)] [&_th]:h-10 [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-[0.08em] [&_tr]:border-0 [&_tr]:hover:bg-transparent",
        className,
      )}
    >
      {children}
    </TableHeader>
  );
}

/** The empty-state row. `colSpan` must match the header's column count. */
export function DataTableEmpty({
  colSpan,
  message,
}: {
  colSpan: number;
  message: string;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="py-12">
        <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
          <span className="flex size-9 items-center justify-center rounded-full border border-border bg-muted">
            <Inbox className="size-4" aria-hidden="true" />
          </span>
          {message}
        </div>
      </TableCell>
    </TableRow>
  );
}
