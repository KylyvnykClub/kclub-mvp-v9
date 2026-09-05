import { getLegalDocument } from "@/lib/mdx";
import { MDXRemote } from "next-mdx-remote/rsc";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { localeAlternates } from "@/lib/seo";
import { legalProse } from "../_components/legal-prose";
import { LegalOperator } from "../_components/legal-operator";
import { LegalShell, LegalHeader } from "../_components/legal-shell";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; document: string }>;
}) {
  const { locale, document: documentSlug } = await params;
  const doc = await getLegalDocument(documentSlug, locale);
  if (!doc) {
    const t = await getTranslations({ locale, namespace: "legal" });
    return { title: t("notFound") };
  }
  return {
    title: doc.title,
    alternates: localeAlternates(locale, `/legal/${doc.id}`),
  };
}

export default async function LegalDocumentPage({
  params,
}: {
  params: Promise<{ locale: string; document: string }>;
}) {
  const { locale, document: documentSlug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");

  const doc = await getLegalDocument(documentSlug, locale);

  if (!doc) {
    notFound();
  }

  const lastUpdated = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
  }).format(new Date(doc.lastUpdated));

  return (
    <LegalShell backHref={`/${locale}/legal`} backLabel={t("backToLegal")}>
      <LegalHeader eyebrow={t("title")} title={doc.title}>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium ring-1 ring-border/60 ring-inset">
            {t("version", { version: doc.version })}
          </span>
          {doc.authoritative && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary ring-1 ring-primary/20 ring-inset"
              title={t("authoritativeHint")}
            >
              <BadgeCheck className="h-3.5 w-3.5" />
              {t("authoritative")}
            </span>
          )}
          <span>{t("lastUpdated", { date: lastUpdated })}</span>
        </div>
      </LegalHeader>

      <div>
        <MDXRemote source={doc.content} components={legalProse} />
      </div>

      <LegalOperator />
    </LegalShell>
  );
}
