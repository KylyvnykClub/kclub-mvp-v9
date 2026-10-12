import type { ReactNode } from "react";

import { FilledImage } from "@/components/media/filled-image";

/**
 * The hero always renders as a dark panel, in both themes, because the copy
 * sits on top of a photograph the partner uploaded and no light palette can be
 * guaranteed to stay legible over it. `dark` is scoped to this element so the
 * tokens inside resolve to the dark set without affecting the rest of the page.
 *
 * The cover is the partner's banner and the page gives it the room (ADR 0038):
 * shown whole, never cropped, filling the panel, whatever its shape
 * (`FilledImage`). The copy and the card are in normal flow over it, with
 * `min-h` as the floor, so nothing overlaps at any width.
 *
 * The country's flag sits on the banner, and under the short description the
 * company's own club card (FR-021): its logo, name, the members' discount and
 * a QR to this page. The owner asked for the card here, in place of the
 * conditions box it replaces - the card carries the same discount. The name
 * stays the page's `h1` for screen readers and search engines, visually
 * hidden. The panel grows past 3:1 when the card needs the room.
 */
export function PartnerHero({
  name,
  coverSrc,
  coverAlt,
  country,
  location,
  taxonomy,
  since,
  card,
  cardNote,
}: {
  name: string;
  coverSrc: string | null;
  coverAlt: string;
  country: { flagSrc: string; name: string } | null;
  location: string | null;
  taxonomy: string | null;
  since: string;
  /** The company's business card. */
  card: ReactNode;
  /** How the discount is redeemed, under the card; null without one. */
  cardNote: string | null;
}) {
  return (
    <div className="dark relative mt-8 overflow-hidden rounded-xl border border-border bg-zinc-950 text-white">
      <div className="absolute inset-0">
        {coverSrc ? (
          <FilledImage src={coverSrc} alt={coverAlt} className="size-full" />
        ) : (
          <div className="kc-fintech-grid size-full bg-zinc-900" />
        )}
      </div>

      <div
        className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a]/85 via-[#0a0a0a]/15 via-[45%] to-transparent"
        aria-hidden="true"
      />

      <div className="relative flex min-h-56 flex-col gap-6 p-4 sm:min-h-72 sm:p-8 lg:min-h-96">
        <h1 className="sr-only">{name}</h1>

        {country && (
          <span
            className="inline-flex w-fit items-center rounded border border-white/20 bg-black/60 p-1.5 backdrop-blur"
            title={country.name}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a static 20x14 flag from /public */}
            <img
              src={country.flagSrc}
              alt={country.name}
              width={20}
              height={14}
              className="h-3.5 w-5 rounded-[1px] object-cover"
            />
          </span>
        )}

        <div className="mt-auto flex flex-col items-start gap-5">
          <div className="min-w-0">
            {location && (
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
                {location}
              </p>
            )}

            {[taxonomy, since].filter(Boolean).length > 0 && (
              <p className="mt-2 text-sm text-white/70">
                {[taxonomy, since].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>

          <div className="flex w-full max-w-[460px] flex-col gap-2">
            {card}
            {cardNote && (
              <span className="text-[11px] text-white/70">{cardNote}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
