import Image from "next/image";
import { QrCode } from "lucide-react";
import { useTranslations } from "next-intl";

export function CardShowcase() {
  const t = useTranslations("home");

  return (
    <section className="dark kclub-section overflow-hidden bg-zinc-950 text-white">
      <div className="kclub-shell grid items-center gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div>
          <p className="kclub-eyebrow !text-white/55">
            {t("hero.cardEyebrow")}
          </p>
          <h2 className="mt-6 text-4xl font-black uppercase leading-[1.05] tracking-[-0.03em] sm:text-6xl">
            {t("features.items.0.title")}
          </h2>
          <p className="mt-6 max-w-lg text-lg font-light leading-8 text-white/65">
            {t("features.items.0.description")} {t("hero.stats.verified.copy")}
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-[620px]">
          <div className="relative aspect-[1.586/1] overflow-hidden rounded-[20px] shadow-[0_24px_80px_-30px_rgba(212,175,55,0.5)]">
            <Image
              src="/brand/backgrounds/card-bg.png"
              alt=""
              fill
              sizes="(max-width: 1024px) 90vw, 620px"
              className="object-cover"
            />
            <div className="absolute inset-0 flex flex-col justify-between p-[7%] text-[#2f2207]">
              <div className="flex items-start justify-between gap-6">
                <Image
                  src="/brand/logo/card-logo.png"
                  width={140}
                  height={54}
                  alt="KYLYVNYK CLUB"
                  className="h-auto w-28 object-contain opacity-90 sm:w-36"
                />
                <span className="text-xs font-black uppercase tracking-[0.22em]">
                  VIP
                </span>
              </div>
              <div className="flex items-end justify-between gap-6">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-65">
                    {t("hero.cardCaption")}
                  </p>
                  <p className="mt-2 font-mono text-base tracking-[0.24em] sm:text-xl">
                    KCLUB 000 001
                  </p>
                </div>
                <QrCode
                  className="size-10 opacity-75 sm:size-14"
                  strokeWidth={1.25}
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
