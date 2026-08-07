import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export function ServicesSection() {
  const t = useTranslations("home");

  return (
    <section
      id="membership"
      className="kclub-section bg-zinc-100 dark:bg-background"
    >
      <div className="kclub-shell">
        <p className="kclub-eyebrow">{t("services.eyebrow")}</p>
        <h2 className="kclub-section-title mt-5 max-w-4xl">
          {t("services.title")}
        </h2>

        <div className="mt-12 grid gap-px border border-border bg-border lg:grid-cols-2">
          <article className="flex min-h-[420px] flex-col justify-between bg-white p-8 text-zinc-950 sm:p-12">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
                01 / Member
              </span>
              <h3 className="mt-6 text-4xl font-black uppercase leading-none">
                {t("services.member.title")}
              </h3>
              <p className="mt-6 max-w-xl text-lg font-light leading-8 text-zinc-600">
                {t("services.member.description")}
              </p>
            </div>
            <Link
              href="/register"
              className="mt-12 inline-flex items-center gap-3 text-sm font-bold uppercase tracking-[0.16em] hover:text-accent"
            >
              {t("services.member.cta")}{" "}
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </article>

          <article className="flex min-h-[420px] flex-col justify-between bg-zinc-950 p-8 text-white sm:p-12">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">
                02 / Partner
              </span>
              <h3 className="mt-6 text-4xl font-black uppercase leading-none">
                {t("services.partner.title")}
              </h3>
              <p className="mt-6 max-w-xl text-lg font-light leading-8 text-white/65">
                {t("services.partner.description")}
              </p>
              <p className="mt-5 border-l border-accent pl-4 text-sm text-white/50">
                {t("services.partner.note")}
              </p>
            </div>
            <Link
              href="/register"
              className="mt-12 inline-flex items-center gap-3 text-sm font-bold uppercase tracking-[0.16em] text-accent hover:text-white"
            >
              {t("services.partner.cta")}{" "}
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}
