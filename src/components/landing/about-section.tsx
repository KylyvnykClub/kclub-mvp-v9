import Image from "next/image";
import { useTranslations } from "next-intl";

import { Reveal } from "./reveal";

export function AboutSection() {
  const t = useTranslations("home");

  return (
    <section id="about" className="kclub-section bg-background">
      <div className="kclub-shell grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <Reveal>
          <p className="kclub-eyebrow">{t("about.eyebrow")}</p>
          <h2 className="kclub-section-title mt-5">{t("about.title")}</h2>
          <div className="mt-8 max-w-2xl space-y-5">
            <p className="kclub-copy text-lg">{t("about.introduction")}</p>
            <p className="kclub-copy">{t("about.community")}</p>
            <p className="kclub-copy">{t("about.trust")}</p>
          </div>
          <div className="mt-10 border-l border-accent pl-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {t("about.mission.eyebrow")}
            </p>
            <h3 className="mt-3 text-2xl font-black uppercase leading-tight">
              {t("about.mission.title")}
            </h3>
            <p className="kclub-copy mt-3">{t("about.mission.description")}</p>
          </div>
        </Reveal>
        <Reveal
          delay={140}
          className="relative min-h-[420px] overflow-hidden bg-zinc-100 lg:min-h-[620px]"
        >
          <Image
            src="/brand/imagery/about-professional.webp"
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 45vw"
            className="object-cover grayscale-[0.35] saturate-75"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/45 via-transparent to-transparent" />
        </Reveal>
      </div>
    </section>
  );
}
