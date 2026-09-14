import {
  Briefcase,
  Building2,
  Car,
  Cpu,
  Dumbbell,
  Factory,
  Scale,
  Stethoscope,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

import { Reveal } from "./reveal";

import type { CategoryBlockRow } from "@/data/companies";
import { Link } from "@/i18n/navigation";

/**
 * One tile per category block, linking into the catalogue already filtered.
 *
 * The tiles are the blocks the reference data actually has, not a fixed list of
 * eight: a tile for a block nobody sells in is a dead end, and the taxonomy is
 * reference data staff can change. The icon is looked up by the block's English
 * key, which is stable; the label shown is the reader's own language, and the
 * `?block=` parameter carries the key, because that is what the catalogue
 * filters on.
 *
 * A block with no icon of its own gets the briefcase rather than no tile.
 */
const ICONS: Record<string, LucideIcon> = {
  "Real Estate, Construction & Home Services": Building2,
  "Automotive, Transportation & Logistics": Car,
  "Healthcare, Health & Care": Stethoscope,
  "Beauty, Fitness & Recovery": Dumbbell,
  "Legal, Finance & Security": Scale,
  "Hospitality, Education & Personal Services": UtensilsCrossed,
  "IT, Marketing, Design & Media": Cpu,
  "Manufacturing, Trade & Agriculture": Factory,
  "Business & Professional Services": Briefcase,
};

export function CategoryTilesSection({
  blocks,
}: {
  blocks: CategoryBlockRow[];
}) {
  if (blocks.length === 0) return null;

  return (
    <section className="border-t border-white/10 bg-[#0b0d14] pb-14 text-white">
      <div className="kclub-shell">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {blocks.map((entry, index) => {
            const Icon = ICONS[entry.key] ?? Briefcase;

            return (
              <li key={entry.key} className="contents">
                <Reveal delay={index * 50}>
                  <Link
                    href={`/directory?block=${encodeURIComponent(entry.key)}`}
                    className="group flex h-full min-h-32 flex-col items-center justify-center gap-3 rounded-lg border border-[#d4af37]/20 bg-[linear-gradient(160deg,#171a24_0%,#0d1017_60%,#141008_100%)] p-4 text-center transition-colors hover:border-[#d4af37]/70"
                  >
                    <Icon
                      className="size-8 text-[#d4af37] transition-transform duration-300 group-hover:scale-110"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    <span className="text-[0.65rem] font-bold uppercase leading-4 tracking-[0.1em] text-white/85">
                      {entry.label}
                    </span>
                  </Link>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
