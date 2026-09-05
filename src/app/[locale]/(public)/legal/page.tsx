import { getAllLegalDocuments } from "@/lib/mdx";
import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { localeAlternates } from "@/lib/seo";
import { LegalOperator } from "./_components/legal-operator";
import { LegalShell, LegalHeader } from "./_components/legal-shell";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return {
    title: t("title"),
    description: t("indexDescription"),
    alternates: localeAlternates(locale, "/legal"),
  };
}

export default async function LegalIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");

  const documents = await getAllLegalDocuments(locale);

  return (
    <LegalShell backHref={`/${locale}`} backLabel={t("backToHome")}>
      <LegalHeader eyebrow={t("title")} title={t("title")}>
        <p className="mt-5 text-[0.9375rem] leading-7 text-foreground/80">
          {t("indexDescription")}
        </p>
      </LegalHeader>

      <ul className="divide-y divide-border/60 border-y border-border/60">
        {documents.map((doc) => (
          <li key={doc.id}>
            <Link
              href={`/${locale}/legal/${doc.id}`}
              className="group flex items-center justify-between gap-4 py-4 transition-colors hover:text-accent-ink"
            >
              <span className="font-serif text-base font-semibold tracking-tight text-foreground transition-colors group-hover:text-accent-ink sm:text-lg">
                {doc.title}
              </span>
              <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                {t("version", { version: doc.version })}
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <LegalOperator />
    </LegalShell>
  );
}
