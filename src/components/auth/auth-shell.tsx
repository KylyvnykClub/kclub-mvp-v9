"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

type AuthShellProps = {
  children: ReactNode;
  eyebrow: string;
  title: string;
  subtitle: string;
};

export function AuthShell({
  children,
  eyebrow,
  title,
  subtitle,
}: AuthShellProps) {
  const locale = useLocale();
  const tLegal = useTranslations("legal");
  const homeHref = `/${locale}`;

  return (
    <main className="dark min-h-screen bg-zinc-950 text-white">
      <div className="kclub-shell relative grid min-h-screen items-center gap-10 py-10 lg:grid-cols-[0.8fr_1fr] lg:py-14">
        <section className="hidden border-l border-accent pl-6 lg:block">
          <Link
            href={homeHref}
            className="absolute left-0 top-10 inline-flex items-center gap-3 text-xs font-extralight uppercase tracking-[0.18em] text-white/55 transition-colors hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring lg:top-14"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {tLegal("backToHome")}
          </Link>
          <Link
            href={homeHref}
            className="inline-flex items-center gap-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            aria-label="KYLYVNYK CLUB"
          >
            <Image
              src="/brand/logo/crown-gold-logo.png"
              width={72}
              height={50}
              alt=""
              priority
              className="h-auto w-16 object-contain"
            />
            <span className="text-sm font-black uppercase tracking-[0.16em] text-accent-ink">
              KYLYVNYK CLUB
            </span>
          </Link>
          <p className="mt-10 text-xs font-black uppercase tracking-[0.22em] text-white/50">
            {eyebrow}
          </p>
          <h1 className="mt-5 max-w-xl text-6xl font-black uppercase leading-[0.9] tracking-[-0.045em]">
            {title}
          </h1>
          <p className="mt-6 max-w-md text-lg font-light leading-8 text-white/60">
            {subtitle}
          </p>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center justify-between gap-4 lg:hidden">
            <Link
              href={homeHref}
              className="flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              aria-label="KYLYVNYK CLUB"
            >
              <Image
                src="/brand/logo/crown-gold-logo.png"
                width={48}
                height={34}
                alt=""
                priority
                className="h-auto w-11 object-contain"
              />
              <span className="text-sm font-black uppercase tracking-[0.16em] text-accent-ink">
                KYLYVNYK CLUB
              </span>
            </Link>
            <Link
              href={homeHref}
              className="inline-flex min-h-11 items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/55 hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              {tLegal("backToHome")}
            </Link>
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}
