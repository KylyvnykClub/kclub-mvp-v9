import { useTranslations } from "next-intl";

type Step = {
  title: string;
  description: string;
};

export function HowItWorksSection() {
  const t = useTranslations("home");
  const steps = t.raw("howItWorks.steps") as Step[];

  return (
    <section id="how-it-works" className="kclub-section bg-muted">
      <div className="kclub-shell">
        <p className="kclub-eyebrow">{t("howItWorks.eyebrow")}</p>
        <h2 className="kclub-section-title mt-5">{t("howItWorks.title")}</h2>

        <ol className="mt-12 grid border-l border-t border-border md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="min-h-72 border-b border-r border-border bg-background p-8"
            >
              <span className="text-4xl font-black text-accent-ink">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-12 text-xl font-black uppercase leading-tight">
                {step.title}
              </h3>
              <p className="kclub-copy mt-4">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
