import Image from "next/image";
import { Globe, Handshake, Users } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Reveal } from "./reveal";

import {
  visibleStats,
  type ClubPresence,
  type StatKey,
} from "@/lib/club-stats";

/**
 * The band under the hero: how many members, partners and countries the club
 * has, over a row of the flags it is actually in.
 *
 * Every figure is read from the database. The reference design filled this band
 * with "10 245+ / 1 250+ / 35+", which is not what the club is, and a landing
 * counter was deleted once already for exactly that overstatement - so a figure
 * below `MIN_STAT_TO_SHOW` is not rounded up or padded, it is left out (see
 * `@/lib/club-stats`), and a band with nothing left to say does not render.
 *
 * The counts are aggregates. No member row reaches this component, and there is
 * no link from a number to the people behind it (ADR 0005).
 */
/** Flags beyond this become a "+N" chip, as the reference has it. */
const MAX_FLAGS = 8;

export async function StatsBandSection({
  presence,
  countryCodes,
}: {
  presence: ClubPresence;
  countryCodes: string[];
}) {
  const t = await getTranslations("home.landing.stats");
  const locale = await getLocale();
  const format = new Intl.NumberFormat(locale);

  const ICONS: Record<StatKey, typeof Users> = {
    members: Users,
    partners: Handshake,
    countries: Globe,
  };
  const stats = visibleStats(presence);

  const flags = countryCodes.slice(0, MAX_FLAGS);
  const overflow = countryCodes.length - flags.length;

  if (stats.length === 0 && flags.length === 0) return null;

  return (
    <section className="border-t border-white/10 bg-[#07090f] py-8 text-white sm:py-10">
      <div className="kclub-shell">
        <Reveal>
          <div className="rounded-2xl border border-[#d4af37]/25 bg-[#0d1017] p-5 sm:p-7">
            {stats.length > 0 && (
              <ul className="grid gap-6 sm:grid-cols-3 sm:gap-4">
                {stats.map(({ key, value }, index) => {
                  const Icon = ICONS[key];

                  return (
                    <li
                      key={key}
                      className={`flex items-center gap-4 sm:justify-center ${
                        index > 0
                          ? "sm:border-l sm:border-white/10 sm:pl-4"
                          : ""
                      }`}
                    >
                      <Icon
                        className="size-9 shrink-0 text-[#d4af37]"
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="font-serif text-2xl font-bold leading-none text-[#e8c66a] sm:text-3xl">
                          {format.format(value)}+
                        </p>
                        <p className="mt-1.5 text-[0.65rem] font-bold uppercase leading-tight tracking-[0.16em] text-white/70">
                          {t(`${key}.label`)}
                          <span className="block font-semibold tracking-[0.12em] text-white/55">
                            {t(`${key}.note`)}
                          </span>
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {flags.length > 0 && (
              <ul
                className={`flex flex-wrap items-center gap-2 sm:gap-2.5 ${
                  stats.length > 0
                    ? "mt-6 border-t border-white/10 pt-5 sm:justify-center"
                    : "sm:justify-center"
                }`}
              >
                {flags.map((code) => (
                  <li key={code}>
                    <Image
                      src={`/flags/${code.toLowerCase()}.png`}
                      alt=""
                      width={60}
                      height={40}
                      className="h-8 w-auto rounded border border-white/20 shadow-md sm:h-9"
                    />
                  </li>
                ))}
                {overflow > 0 && (
                  <li className="flex h-8 items-center rounded border border-[#d4af37]/40 px-3 text-xs font-bold text-[#e8c66a] sm:h-9">
                    {t("more", { count: overflow })}
                  </li>
                )}
              </ul>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
