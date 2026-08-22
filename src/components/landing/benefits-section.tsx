import {
  BadgeCheck,
  CreditCard,
  Globe2,
  Handshake,
  Languages,
  ShieldCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";

type Feature = {
  title: string;
  description: string;
};

const icons = [
  CreditCard,
  BadgeCheck,
  Globe2,
  Handshake,
  Languages,
  ShieldCheck,
] as const;

export function BenefitsSection() {
  const t = useTranslations("home");
  const items = t.raw("features.items") as Feature[];

  return (
    <section id="benefits" className="kclub-section bg-muted">
      <div className="kclub-shell">
        <p className="kclub-eyebrow">{t("features.eyebrow")}</p>
        <h2 className="kclub-section-title mt-5">{t("features.title")}</h2>

        <div className="mt-12 grid border-l border-t border-border md:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => {
            // The feature order is fixed by the localized V4 content contract.
            // eslint-disable-next-line security/detect-object-injection
            const Icon = icons[index] ?? ShieldCheck;
            return (
              <article
                key={item.title}
                className="group relative min-h-64 border-b border-r border-border p-8 transition-colors duration-200 hover:bg-background sm:p-10"
              >
                <Icon
                  className="size-8 text-accent-ink"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <h3 className="mt-10 text-xl font-black uppercase leading-tight tracking-[-0.02em]">
                  {item.title}
                </h3>
                <p className="kclub-copy mt-3 max-w-xs">{item.description}</p>
                <span className="absolute bottom-0 left-0 h-1 w-0 bg-accent transition-[width] duration-200 group-hover:w-full" />
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
