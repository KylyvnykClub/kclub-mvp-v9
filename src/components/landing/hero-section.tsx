import Image from "next/image";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export function HeroSection() {
  const t = useTranslations("home");

  return (
    <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-white to-zinc-100 dark:from-[#121212] dark:to-[#0f0f0f]">
      <div
        className="absolute inset-y-0 right-0 hidden w-[58%] lg:block"
        aria-hidden="true"
      >
        <Image
          src="/brand/backgrounds/hero-bg.png"
          alt=""
          fill
          priority
          sizes="58vw"
          className="object-contain object-right opacity-[0.13] grayscale sepia dark:opacity-[0.2]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/35 to-transparent dark:from-[#121212] dark:via-[#121212]/20" />
      </div>

      <div className="kclub-shell relative py-16 sm:py-20 lg:py-24">
        <div className="max-w-4xl">
          <p className="kclub-eyebrow">{t("hero.eyebrow")}</p>
          <h1 className="mt-8 text-[clamp(2.25rem,10vw,3.5rem)] font-black uppercase leading-[0.86] tracking-[-0.055em] text-zinc-950 dark:text-white sm:text-[clamp(3.5rem,8.5vw,7.5rem)]">
            <span className="block">{t("hero.titleLine1")}</span>
            <span className="block text-accent">{t("hero.titleLine2")}</span>
          </h1>
          <p className="mt-8 max-w-2xl text-xl font-extralight leading-8 text-zinc-600 dark:text-white/70 sm:text-2xl">
            {t("hero.subline")}
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/register" className="kclub-brand-button">
              {t("hero.primaryCta")} <span aria-hidden="true">↗</span>
            </Link>
            <Link href="#membership" className="kclub-outline-button">
              {t("hero.secondaryCta")} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        <div className="mt-16 grid border-t border-zinc-200 pt-8 dark:border-white/10 sm:grid-cols-3 sm:gap-8">
          {(["verified", "access", "reach"] as const).map((item) => (
            <div key={item} className="border-l border-accent py-3 pl-4">
              <p className="text-sm font-semibold">
                {t(`hero.stats.${item}.title`)}
              </p>
              <p className="mt-2 max-w-xs text-sm font-light leading-6 text-muted-foreground">
                {t(`hero.stats.${item}.copy`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
