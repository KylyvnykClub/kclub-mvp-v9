import {
  ChevronRight,
  CreditCard,
  Handshake,
  Percent,
  UserPlus,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Reveal } from "./reveal";

/**
 * The four steps from registration to a discount, on the landing page.
 *
 * This is the reference's row, not `HowItWorksSection` - that one is the prose
 * version further down the page, which the header's "how it works" link still
 * points at and which a search engine reads. Two renderings of the same idea is
 * deliberate: this one is scannable, that one is indexable.
 *
 * The chevrons between the steps are decorative and hidden from assistive
 * technology; the list is already ordered, which is what carries the sequence.
 */
const STEP_ICONS = [UserPlus, CreditCard, Handshake, Percent] as const;

export async function StepsSection() {
  const t = await getTranslations("home.landing.steps");
  const steps = t.raw("items") as { title: string; description: string }[];

  return (
    <section
      id="how-it-works"
      className="border-t border-white/10 bg-[#0b0d14] py-12 text-white sm:py-16"
    >
      <div className="kclub-shell">
        <Reveal>
          <h2 className="flex items-center justify-center gap-4 text-center text-xl font-black uppercase tracking-[0.16em] text-[#e8c66a] sm:text-2xl">
            <span
              className="hidden h-px flex-1 bg-gradient-to-r from-transparent to-[#d4af37]/60 sm:block"
              aria-hidden
            />
            {t("title")}
            <span
              className="hidden h-px flex-1 bg-gradient-to-l from-transparent to-[#d4af37]/60 sm:block"
              aria-hidden
            />
          </h2>
        </Reveal>

        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => {
            const Icon = STEP_ICONS[index] ?? UserPlus;

            return (
              <li key={step.title} className="relative">
                <Reveal delay={index * 90} className="h-full">
                  <div className="flex h-full flex-col items-center gap-3 rounded-xl border border-[#d4af37]/25 bg-[#11141c] p-5 text-center">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#d4af37]/60 text-xs font-bold text-[#e8c66a]">
                      {index + 1}
                    </span>
                    <Icon className="size-9 text-[#d4af37]" aria-hidden />
                    <h3 className="text-xs font-bold uppercase leading-tight tracking-[0.12em] text-[#e8c66a]">
                      {step.title}
                    </h3>
                    <p className="text-sm leading-snug text-white/60">
                      {step.description}
                    </p>
                  </div>
                </Reveal>

                {index < steps.length - 1 && (
                  <ChevronRight
                    className="absolute -right-3 top-1/2 hidden size-6 -translate-y-1/2 text-[#d4af37]/70 lg:block"
                    aria-hidden
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
