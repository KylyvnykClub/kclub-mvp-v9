import Image from "next/image";
import { useTranslations } from "next-intl";

import { Reveal } from "./reveal";
import { HeroBackdrop } from "./hero-backdrop";

/**
 * The landing hero, built to the client's reference: the emblem on the
 * horizon, the name in wide-tracked display caps, then the lockup line between
 * two rules, then the subtitle.
 *
 * The backdrop is `HeroBackdrop`: a drawn night sky, the licensed city
 * photograph on the horizon, and the curve of the planet under it with the
 * world's own coordinates as its city lights.
 *
 * The type is `font-display` (Playfair Display), not the `font-serif` alias
 * that the rest of the app resolves to Oxanium: the reference sets the brand in
 * Roman capitals with hairline serifs, which a squared techno sans cannot do.
 *
 * Always dark, in both themes: the page wraps itself in `dark`, and the copy
 * here sits on near-black regardless of what the reader chose elsewhere.
 */

export function HomeHero() {
  const t = useTranslations("home.landing.hero");

  const pillars = ["people", "opportunity", "growth", "borderless"] as const;

  return (
    <section className="relative isolate overflow-hidden bg-[#07090f] text-white">
      <HeroBackdrop />

      <div className="kclub-shell relative py-14 sm:py-20 lg:py-24">
        {/* The two script lines are ornament, and they are the first thing to
            go when the viewport cannot afford them. */}
        <p className="pointer-events-none absolute left-6 top-10 hidden max-w-[10rem] font-serif text-2xl italic leading-tight text-[#d4af37]/85 lg:block">
          {t("scriptLeft")}
        </p>
        <p className="pointer-events-none absolute right-6 top-10 hidden max-w-[10rem] text-right font-serif text-2xl italic leading-tight text-[#d4af37]/85 lg:block">
          {t("scriptRight")}
        </p>

        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <Reveal>
            <Image
              src="/brand/logo/emblem.png"
              alt=""
              width={200}
              height={224}
              priority
              className="h-28 w-auto sm:h-36 lg:h-44"
            />
          </Reveal>

          <Reveal delay={90}>
            {/* The tracking is the reference's, and it is why the name is
                rendered on its own line: "Kylyvnyk Club" at this spacing does
                not survive a 390px viewport. */}
            <h1 className="mt-6 font-display text-[clamp(2rem,9vw,3.6rem)] font-medium uppercase leading-[1.05] tracking-[0.16em] text-[#e8c66a] sm:text-[clamp(2.8rem,7vw,4.6rem)] sm:tracking-[0.22em]">
              {t("wordmark")}
            </h1>
          </Reveal>

          <Reveal delay={140}>
            <div className="mt-3 flex w-full items-center justify-center gap-3 sm:gap-5">
              <span
                className="h-px w-8 bg-gradient-to-r from-transparent to-[#d4af37]/70 sm:w-16"
                aria-hidden="true"
              />
              <p className="font-display text-[0.7rem] font-medium uppercase tracking-[0.3em] text-[#e8c66a]/90 sm:text-base sm:tracking-[0.4em]">
                {t("lockup")}
              </p>
              <span
                className="h-px w-8 bg-gradient-to-l from-transparent to-[#d4af37]/70 sm:w-16"
                aria-hidden="true"
              />
            </div>
          </Reveal>

          <Reveal delay={190}>
            <p className="mt-4 font-display text-[0.68rem] uppercase tracking-[0.2em] text-white/70 sm:text-sm sm:tracking-[0.28em]">
              {t("kicker")}
            </p>
          </Reveal>

          <Reveal delay={250}>
            <p className="mt-8 font-display text-base font-semibold uppercase tracking-[0.1em] text-[#e8c66a] sm:text-2xl">
              {t("tagline")}
            </p>
          </Reveal>

          <Reveal delay={300}>
            <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-white/75 sm:text-xs sm:tracking-[0.26em]">
              {pillars.map((pillar, index) => (
                <li key={pillar} className="flex items-center gap-3">
                  {index > 0 && (
                    <span aria-hidden="true" className="text-[#d4af37]">
                      •
                    </span>
                  )}
                  {t(`pillars.${pillar}`)}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
