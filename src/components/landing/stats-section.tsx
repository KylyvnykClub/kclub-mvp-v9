import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/data/db";
import { countMemberPresence } from "@/data/members";
import { CountUp } from "./count-up";
import { Reveal } from "./reveal";

const SKIP_DB_PRERENDER = process.env.KCLUB_SKIP_DB_PRERENDER === "1";

export async function StatsSection() {
  if (SKIP_DB_PRERENDER) return null;

  const t = await getTranslations("home");
  const locale = await getLocale();
  const { members, countries } = await countMemberPresence(db);

  // A club that cannot yet show a membership number advertises nothing.
  if (members === 0) return null;

  const stats = [
    [members, "members"],
    [countries, "countries"],
  ] as const;

  return (
    <section
      aria-label={t("common.statsSection")}
      className="border-b border-border bg-background py-8"
    >
      <Reveal>
        <div className="kclub-shell grid grid-cols-2 gap-px border border-border bg-border">
          {stats.map(([value, key]) => (
            <div
              key={key}
              className="flex min-h-40 flex-col items-center justify-center bg-background px-4 py-8 text-center"
            >
              <p className="text-4xl font-black leading-none text-zinc-950 dark:text-white sm:text-5xl">
                <CountUp value={value} locale={locale} />
                <span className="text-accent-ink">.</span>
              </p>
              <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {t(`stats.${key}`)}
              </p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
