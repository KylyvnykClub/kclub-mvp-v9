import Image from "next/image";
import { useTranslations } from "next-intl";

import { ParallaxLayer } from "./parallax";
import { Reveal } from "./reveal";

import { Link } from "@/i18n/navigation";

export function CtaSection() {
  const t = useTranslations("home");

  return (
    <section className="relative isolate overflow-hidden border-b border-border py-20 text-white sm:py-24">
      <ParallaxLayer
        factor={0.06}
        className="absolute -inset-y-12 inset-x-0 -z-20"
      >
        <Image
          src="/brand/imagery/cta-banner.webp"
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
        />
      </ParallaxLayer>
      <div className="absolute inset-0 -z-10 bg-zinc-950/78" />
      <div className="kclub-shell flex flex-col items-start justify-between gap-10 lg:flex-row lg:items-end">
        <Reveal>
          <p className="kclub-eyebrow !text-white/60">KCLUB</p>
          <h2 className="mt-5 max-w-4xl text-4xl font-black uppercase leading-[1.05] tracking-[-0.03em] sm:text-6xl">
            {t("cta.title")}
          </h2>
          <p className="mt-5 max-w-2xl text-lg font-light leading-8 text-white/70">
            {t("cta.subline")}
          </p>
        </Reveal>
        <Reveal delay={150} className="shrink-0">
          <Link href="/register" className="kclub-brand-button">
            {t("cta.button")}
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
