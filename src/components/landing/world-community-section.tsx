import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { Reveal } from "./reveal";

/**
 * The band that closes the landing page: the countries the club is actually in.
 *
 * The flags are the registration countries of the published partners, not a
 * decorative set - a band that showed fourteen flags for four partners would be
 * the same overstatement the membership counter was removed for. With no
 * partners published there is nothing to say, and the section renders nothing.
 */
export async function WorldCommunitySection({
  countryCodes,
}: {
  countryCodes: string[];
}) {
  if (countryCodes.length === 0) return null;

  const t = await getTranslations("home.landing.community");

  return (
    <section className="relative isolate overflow-hidden border-t border-white/10 bg-[#07090f] py-14 text-white">
      <div className="absolute inset-0" aria-hidden="true">
        <Image
          src="/brand/backgrounds/hero-bg.png"
          alt=""
          fill
          sizes="100vw"
          className="object-cover opacity-[0.14] mix-blend-screen"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(90% 70% at 50% 100%, rgba(212,175,55,0.16), transparent 70%)",
          }}
        />
      </div>

      <div className="kclub-shell relative">
        <Reveal>
          <ul className="flex flex-wrap items-end justify-center gap-3 sm:gap-4">
            {countryCodes.map((code) => (
              <li key={code}>
                <Image
                  src={`/flags/${code.toLowerCase()}.png`}
                  alt=""
                  width={60}
                  height={40}
                  className="h-8 w-auto rounded-sm border border-white/20 shadow-lg sm:h-10"
                />
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={120}>
          <p className="mt-9 text-center font-serif text-2xl font-bold uppercase leading-tight tracking-[0.04em] text-white sm:text-3xl">
            {t("title")}
          </p>
          <p className="mt-1 text-center font-serif text-2xl font-bold uppercase tracking-[0.08em] text-[#e8c66a] sm:text-3xl">
            {t("subtitle")}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
