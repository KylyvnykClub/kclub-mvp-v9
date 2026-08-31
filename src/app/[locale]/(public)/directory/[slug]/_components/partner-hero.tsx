import Image from "next/image";
import type { ReactNode } from "react";

/**
 * The hero always renders as a dark panel, in both themes, because the copy
 * sits on top of a photograph the partner uploaded and no light palette can be
 * guaranteed to stay legible over it. `dark` is scoped to this element so the
 * tokens inside resolve to the dark set without affecting the rest of the page.
 */
export function PartnerHero({
  name,
  coverSrc,
  coverAlt,
  logoUrl,
  logoAlt,
  badges,
  location,
  taxonomy,
  since,
  conditions,
}: {
  name: string;
  coverSrc: string | null;
  coverAlt: string;
  logoUrl: string | null;
  logoAlt: string;
  badges: ReactNode[];
  location: string | null;
  taxonomy: string | null;
  since: string;
  conditions: { title: string; value: string; note: string } | null;
}) {
  return (
    <div className="dark relative mt-8 overflow-hidden rounded-xl border border-border bg-zinc-950 text-white">
      <div className="relative h-56 w-full sm:h-72 lg:h-[300px]">
        {coverSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- own-origin, already re-encoded bytes (ADR 0022)
          <img
            src={coverSrc}
            alt={coverAlt}
            className="size-full object-cover"
          />
        ) : (
          <div className="kc-fintech-grid size-full bg-zinc-900" />
        )}
      </div>

      <div
        className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] from-[8%] via-[#0a0a0a]/55 via-[55%] to-[#0a0a0a]/10"
        aria-hidden="true"
      />

      {badges.length > 0 && (
        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          {badges.map((badge, i) => (
            <span
              key={i}
              className="inline-flex items-center rounded border border-white/20 bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/85 backdrop-blur"
            >
              {badge}
            </span>
          ))}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-7 p-6 sm:p-8">
        <div className="min-w-0">
          {logoUrl && (
            <div className="relative mb-4 size-16 border border-white/15 bg-white/5">
              <Image
                src={logoUrl}
                alt={logoAlt}
                fill
                unoptimized
                sizes="64px"
                className="object-contain p-2"
              />
            </div>
          )}

          {location && (
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/55">
              {location}
            </p>
          )}

          <h1 className="mt-2 font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl lg:text-[38px]">
            {name}
          </h1>

          <p className="mt-2 text-sm text-white/55">
            {[taxonomy, since].filter(Boolean).join(" · ")}
          </p>
        </div>

        {conditions && (
          <div
            className="flex flex-col items-end gap-1.5 rounded-lg border border-accent-ink bg-black/70 px-4 py-3.5"
            style={{ boxShadow: "var(--glow-gold)" }}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-ink">
              {conditions.title}
            </span>
            <span className="font-mono text-2xl leading-none text-white">
              {conditions.value}
            </span>
            <span className="text-right text-[11px] text-white/55">
              {conditions.note}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
