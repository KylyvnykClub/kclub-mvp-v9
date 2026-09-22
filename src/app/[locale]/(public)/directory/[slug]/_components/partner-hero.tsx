import Image from "next/image";
import type { ReactNode } from "react";

/**
 * The hero always renders as a dark panel, in both themes, because the copy
 * sits on top of a photograph the partner uploaded and no light palette can be
 * guaranteed to stay legible over it. `dark` is scoped to this element so the
 * tokens inside resolve to the dark set without affecting the rest of the page.
 *
 * The cover is the background and the copy is in normal flow, rather than the
 * copy being absolutely positioned over a fixed-height cover. The fixed-height
 * version collapsed on a phone: a long partner name wraps to three lines, and
 * a block pinned to `bottom-0` grows upward, straight through the badges
 * pinned to `top-4`. The panel now takes its height from whatever the content
 * needs, with `min-h` only setting the floor, so nothing can overlap at any
 * width.
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
      <div className="absolute inset-0">
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

      <div className="relative flex min-h-56 flex-col gap-6 p-4 sm:min-h-72 sm:p-8 lg:min-h-[300px]">
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-2">
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

        <div className="mt-auto flex flex-wrap items-end justify-between gap-x-7 gap-y-5">
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

            <h1 className="mt-2 font-serif text-2xl font-bold leading-[1.15] tracking-tight sm:text-4xl lg:text-[38px]">
              {name}
            </h1>

            {[taxonomy, since].filter(Boolean).length > 0 && (
              <p className="mt-2 text-sm text-white/55">
                {[taxonomy, since].filter(Boolean).join(" · ")}
              </p>
            )}
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
    </div>
  );
}
