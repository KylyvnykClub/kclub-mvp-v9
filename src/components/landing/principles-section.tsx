import { useTranslations } from "next-intl";

const principleKeys = [
  "trust",
  "mutualBenefit",
  "quality",
  "privacy",
  "international",
] as const;

export function PrinciplesSection() {
  const t = useTranslations("home");

  return (
    <section className="kclub-section bg-background">
      <div className="kclub-shell">
        <p className="kclub-eyebrow">{t("principles.eyebrow")}</p>
        <h2 className="kclub-section-title mt-5">{t("principles.title")}</h2>
        <ol className="mt-12 border-y border-border">
          {principleKeys.map((key, index) => (
            <li
              key={key}
              className="grid gap-5 border-b border-border py-8 last:border-b-0 sm:grid-cols-[5rem_1fr] sm:gap-8"
            >
              <span className="text-3xl font-semibold text-accent-ink">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="grid gap-3 lg:grid-cols-[0.65fr_1.35fr] lg:gap-10">
                <h3 className="text-2xl font-semibold">
                  {t(`principles.items.${key}.title`)}
                </h3>
                <p className="kclub-copy">
                  {t(`principles.items.${key}.description`)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
