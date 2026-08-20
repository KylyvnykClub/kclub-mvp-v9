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
  /** `summary` arrives already formatted - the caller owns the interpolation. */
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
          size="sm"
          disabled={!canPrevious}
          asChild={canPrevious}
        >
          {canPrevious ? (
            <Link href={buildHref(page - 1)}>
              <ChevronLeft className="size-4" />
              {labels.previous}
            </Link>
          ) : (
            <span>
              <ChevronLeft className="size-4" />
              {labels.previous}
            </span>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!canNext}
          asChild={canNext}
        >
          {canNext ? (
            <Link href={buildHref(page + 1)}>
              {labels.next}
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span>
              {labels.next}
              <ChevronRight className="size-4" />
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
