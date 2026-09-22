"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { KylReveal } from "./kyl-reveal";

import { CLUB_CONTACT_EMAIL } from "@/lib/contact";

/**
 * The FAQ, as the design's individual cards rather than one ruled list.
 *
 * One panel open at a time, and choosing the open one closes it - the prototype
 * behaviour, kept. `aria-expanded`, `aria-controls`, `aria-labelledby` and
 * `hidden` stay in step with the open index, because the accordion is operated
 * by keyboard as often as by pointer.
 */
const ITEMS = ["1", "2", "3", "4", "5"] as const;

export function KylFaq() {
  const t = useTranslations("home.kyl.faq");
  const [open, setOpen] = useState<string | null>("1");

  return (
    <section className="faq section" id="faq" aria-labelledby="faq-title">
      <div className="shell faq-layout">
        <KylReveal className="section-heading">
          <h2 id="faq-title">{t("title")}</h2>
          <p>{t("lede")}</p>
          <a
            className="button button-secondary faq-contact"
            href={`mailto:${CLUB_CONTACT_EMAIL}`}
          >
            {t("contact")}
          </a>
        </KylReveal>

        <KylReveal className="accordion">
          {ITEMS.map((id) => {
            const isOpen = open === id;

            return (
              <article
                className={`faq-item${isOpen ? " is-open" : ""}`}
                key={id}
              >
                <h3>
                  <button
                    type="button"
                    id={`kyl-faq-button-${id}`}
                    aria-expanded={isOpen}
                    aria-controls={`kyl-faq-panel-${id}`}
                    onClick={() => setOpen(isOpen ? null : id)}
                  >
                    <span>{t(`q${id}`)}</span>
                    <i aria-hidden="true" />
                  </button>
                </h3>
                <div
                  className="faq-panel"
                  id={`kyl-faq-panel-${id}`}
                  role="region"
                  aria-labelledby={`kyl-faq-button-${id}`}
                  hidden={!isOpen}
                >
                  <p>{t(`a${id}`)}</p>
                </div>
              </article>
            );
          })}
        </KylReveal>
      </div>
    </section>
  );
}
