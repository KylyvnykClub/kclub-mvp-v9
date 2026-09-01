import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminPagination({
  page,
  totalPages,
  buildHref,
  labels,
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
  /**
   * `summary` arrives already formatted - the caller owns the interpolation.
   * `previous`/`next` are accessible names: the buttons show arrows only.
   */
  labels: { previous: string; next: string; summary: string };
}) {
  if (totalPages <= 1) return null;

  const canPrevious = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
      <p className="text-xs font-medium text-muted-foreground">
        {labels.summary}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label={labels.previous}
          disabled={!canPrevious}
          asChild={canPrevious}
        >
          {canPrevious ? (
            <Link href={buildHref(page - 1)}>
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <span>
              <ChevronLeft className="size-4" aria-hidden="true" />
            </span>
          )}
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label={labels.next}
          disabled={!canNext}
          asChild={canNext}
        >
          {canNext ? (
            <Link href={buildHref(page + 1)}>
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <span>
              <ChevronRight className="size-4" aria-hidden="true" />
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
