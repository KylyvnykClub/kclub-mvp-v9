import type { ReactNode } from "react";

import type { PublicReview } from "@/data/company-reviews";
import { Stars } from "@/components/reviews/stars";
import { SectionHeader } from "./partner-sections";

/**
 * FR-130: the reviews block on a partner's page. Approved reviews only, each
 * signed the same way - nobody is told who wrote what (ADR 0047, ADR 0005).
 */
export function PartnerReviews({
  summary,
  reviews,
  locale,
  labels,
  form,
}: {
  summary: { count: number; average: number | null };
  reviews: PublicReview[];
  locale: string;
  labels: {
    section: string;
    empty: string;
    author: string;
    average: string;
    ratingOutOf: (rating: number) => string;
  };
  form: ReactNode;
}) {
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "long" });

  return (
    <section id="reviews">
      <SectionHeader label={labels.section} count={summary.count} />

      {summary.average !== null && (
        <div className="mt-4 flex items-center gap-3">
          <Stars rating={Math.round(summary.average)} size="size-5" />
          <span className="text-sm text-foreground">{labels.average}</span>
        </div>
      )}

      {reviews.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {reviews.map((review) => (
            <li key={review.id} className="space-y-2 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span role="img" aria-label={labels.ratingOutOf(review.rating)}>
                  <Stars rating={review.rating} size="size-4" />
                </span>
                <span className="text-xs text-muted-foreground">
                  {labels.author} · {dateFormatter.format(review.createdAt)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                {review.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">{form}</div>
    </section>
  );
}
