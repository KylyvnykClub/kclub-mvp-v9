import {
  CreditCard,
  Globe2,
  Handshake,
  LayoutGrid,
  ShieldCheck,
  Tag,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Reveal } from "./reveal";

type Feature = {
  title: string;
  description: string;
};

// Order mirrors the localized features.items array: community, card,
// offers, catalogue, introductions, privacy.
const icons = [
  Globe2,
  CreditCard,
  Tag,
  LayoutGrid,
  Handshake,
  ShieldCheck,
] as const;

export function BenefitsSection() {
  const t = useTranslations("home");
  const items = t.raw("features.items") as Feature[];

  return (
    <section id="benefits" className="kclub-section bg-muted">
      <div className="kclub-shell">
        <Reveal>
          <p className="kclub-eyebrow">{t("features.eyebrow")}</p>
          <h2 className="kclub-section-title mt-5">{t("features.title")}</h2>
        </Reveal>

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
                <Reveal delay={index * 70}>
                  <Icon
                    className="size-8 text-accent-ink"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <h3 className="mt-10 text-xl font-black uppercase leading-tight tracking-[-0.02em]">
                    {item.title}
                  </h3>
                  <p className="kclub-copy mt-3 max-w-xs">{item.description}</p>
                </Reveal>
                <span className="absolute bottom-0 left-0 h-1 w-0 bg-accent transition-[width] duration-200 group-hover:w-full" />
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
