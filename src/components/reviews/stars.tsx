import { Star } from "lucide-react";

/** Five stars, the first `rating` of them filled (ADR 0047). Decorative: the caller labels it. */
export function Stars({ rating, size }: { rating: number; size: string }) {
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={`${size} ${
            value <= rating
              ? "fill-accent text-accent"
              : "fill-transparent text-muted-foreground/40"
          }`}
        />
      ))}
    </span>
  );
}
