import { useTranslations } from "next-intl";

const stats = [
  ["1,200+", "members"],
  ["12", "countries"],
  ["340+", "partners"],
  ["5", "years"],
] as const;

export function StatsSection() {
  const t = useTranslations("home");

  return (
    <section
      aria-label={t("common.statsSection")}
      className="border-b border-border bg-background py-8"
    >
      <div className="kclub-shell grid grid-cols-2 gap-px border border-border bg-border lg:grid-cols-4">
        {stats.map(([value, key]) => (
          <div
            key={key}
            className="flex min-h-40 flex-col items-center justify-center bg-background px-4 py-8 text-center"
          >
            <p className="text-4xl font-black leading-none text-zinc-950 dark:text-white sm:text-5xl">
              {value}
              <span className="text-accent">.</span>
            </p>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
              {t(`stats.${key}`)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
