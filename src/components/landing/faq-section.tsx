"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

type FaqItem = {
  question: string;
  answer: string;
};

export function FaqSection() {
  const t = useTranslations("home");
  const items = t.raw("faq.items") as FaqItem[];
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section id="faq" className="kclub-section bg-muted">
      <div className="kclub-shell grid gap-10 lg:grid-cols-[0.75fr_1.25fr]">
        <div>
          <p className="kclub-eyebrow">{t("faq.eyebrow")}</p>
          <h2 className="kclub-section-title mt-5">{t("faq.title")}</h2>
        </div>

        <div className="border-t border-border bg-background">
          {items.map((item, index) => {
            const open = openIndex === index;
            const panelId = `faq-panel-${index}`;
            const buttonId = `faq-button-${index}`;

            return (
              <div key={item.question} className="border-b border-border">
                <button
                  id={buttonId}
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex(open ? -1 : index)}
                  className="flex min-h-16 w-full items-center justify-between gap-5 px-5 py-5 text-left text-base font-black uppercase transition-colors hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                >
                  <span>{item.question}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`size-5 shrink-0 text-accent-ink transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                    strokeWidth={1.5}
                  />
                </button>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  aria-hidden={!open}
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ${
                    open
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="kclub-copy px-5 pb-6">{item.answer}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
