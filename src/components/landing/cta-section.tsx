import Image from "next/image";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export function CtaSection() {
  const t = useTranslations("home");

  return (
    <section className="relative isolate overflow-hidden border-b border-border py-20 text-white sm:py-24">
      <Image
        src="/brand/imagery/cta-banner.webp"
        alt=""
        fill
        sizes="100vw"
        className="-z-20 object-cover"
      />
      <div className="absolute inset-0 -z-10 bg-zinc-950/78" />
      <div className="kclub-shell flex flex-col items-start justify-between gap-10 lg:flex-row lg:items-end">
        <div>
          <p className="kclub-eyebrow !text-white/60">KCLUB</p>
          <h2 className="mt-5 max-w-4xl text-4xl font-black uppercase leading-[1.05] tracking-[-0.03em] sm:text-6xl">
            {t("cta.title")}
          </h2>
          <p className="mt-5 max-w-2xl text-lg font-light leading-8 text-white/70">
            {t("cta.subline")}
          </p>
        </div>
        <Link href="/register" className="kclub-brand-button shrink-0">
          {t("cta.button")} <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </section>
  );
}
