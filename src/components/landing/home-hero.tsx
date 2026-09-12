import Image from "next/image";
import { useTranslations } from "next-intl";

import { Reveal } from "./reveal";

/**
 * The landing hero, as the club asked for it: one dark panel with the emblem
 * at the centre and the mark under it.
 *
 * There is no photograph here. The reference the client drew used a city
 * skyline; what this repository owns is the emblem and a dotted world map, so
 * the depth is built instead — a radial wash behind the emblem, the map at low
 * opacity, and a gold hairline under the wordmark. That keeps the section
 * shippable without buying stock imagery, and the photograph can replace the
 * background later without touching the type.
 *
 * Always dark, in both themes: the page wraps itself in `dark`, and the copy
 * here sits on near-black regardless of what the reader chose elsewhere.
 */
export function HomeHero() {
  const t = useTranslations("home.landing.hero");

  const pillars = ["people", "opportunity", "growth", "borderless"] as const;

  return (
    <section className="relative isolate overflow-hidden bg-[#07090f] text-white">
      {/* Backdrop, in four layers. Decorative in full: a screen reader is told
          nothing here that the heading below does not already say.

          The photograph is anchored to the bottom because its sky is empty and
          its skyline is not - the type sits over the sky, the lights stay under
          the fold of the section. Everything above it exists to keep the gold
          type legible: a dark scrim, then the gold wash behind the emblem, then
          a fade into the section below. Contrast on this section is checked by
          the axe pass in the e2e suite, and the scrim is what passes it. */}
      <div className="absolute inset-0" aria-hidden="true">
        <Image
          src="/brand/backgrounds/hero-city.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-bottom"
        />
        <div className="absolute inset-0 bg-[#07090f]/72" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 85% at 50% 12%, rgba(212,175,55,0.22) 0%, rgba(212,175,55,0.06) 38%, transparent 68%)",
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#07090f] to-transparent" />
      </div>

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
            <h1 className="mt-7 font-serif text-[clamp(2.5rem,10vw,4rem)] font-bold uppercase leading-[0.95] tracking-[0.02em] text-[#e8c66a] sm:text-[clamp(3.5rem,8vw,5.5rem)]">
              {t("wordmark")}
            </h1>
          </Reveal>

          <Reveal delay={140}>
            <p className="mt-3 text-[0.7rem] font-semibold uppercase tracking-[0.34em] text-white/70 sm:text-sm sm:tracking-[0.42em]">
              {t("kicker")}
            </p>
          </Reveal>

          <Reveal delay={190}>
            <hr className="kc-gold-rule mt-7 w-full max-w-xl" />
          </Reveal>

          <Reveal delay={240}>
            <p className="mt-6 text-lg font-bold uppercase tracking-[0.08em] text-[#e8c66a] sm:text-2xl">
              {t("tagline")}
            </p>
          </Reveal>

          <Reveal delay={300}>
            <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-white/75 sm:text-xs sm:tracking-[0.26em]">
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
