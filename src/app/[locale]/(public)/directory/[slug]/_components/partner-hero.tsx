import { FilledImage } from "@/components/media/filled-image";

/**
 * The hero always renders as a dark panel, in both themes, because the copy
 * sits on top of a photograph the partner uploaded and no light palette can be
 * guaranteed to stay legible over it. `dark` is scoped to this element so the
 * tokens inside resolve to the dark set without affecting the rest of the page.
 *
 * The cover is the partner's banner and the page gives it the room (ADR 0038):
 * shown whole, never cropped, filling the panel. The panel is 3:1 from `sm`
 * up - the shape the upload hint asks for, so a banner made to it fills the
 * panel edge to edge - and any other shape is filled by `FilledImage`. The
 * copy is in normal flow over it, with `min-h` as the floor, so nothing
 * overlaps at any width.
 *
 * Only the country's flag sits on the banner, and neither the logo nor the
 * name is printed over it: the owner asked for the banner to carry the
 * partner's own image, not ours on top of it. The name stays the page's `h1`
 * for screen readers and search engines, visually hidden.
 */
export function PartnerHero({
  name,
  coverSrc,
  coverAlt,
  country,
  location,
  taxonomy,
  since,
  conditions,
}: {
  name: string;
  coverSrc: string | null;
  coverAlt: string;
  country: { flagSrc: string; name: string } | null;
  location: string | null;
  taxonomy: string | null;
  since: string;
  conditions: { title: string; value: string; note: string } | null;
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

      <div className="relative flex min-h-56 flex-col gap-6 p-4 sm:aspect-[3/1] sm:min-h-72 sm:p-8">
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

        <div className="mt-auto flex flex-wrap items-end justify-between gap-x-7 gap-y-5">
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
