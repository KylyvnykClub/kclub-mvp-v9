import { getLegalDocument } from "@/lib/mdx";
import { MDXRemote } from "next-mdx-remote/rsc";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BadgeCheck } from "lucide-react";

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
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-700">
        <Link
          href={`/${locale}/legal`}
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-accent transition-colors mb-8"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("backToLegal")}
        </Link>

        <header className="mb-10 border-b border-border/40 pb-8">
          <h1 className="text-4xl sm:text-5xl font-serif font-bold tracking-tight text-foreground mb-6">
            {doc.title}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center rounded-full bg-secondary/50 px-3 py-1 text-xs font-medium ring-1 ring-inset ring-border/50">
              {t("version", { version: doc.version })}
            </span>
            {doc.authoritative && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20"
                title={t("authoritativeHint")}
              >
                <BadgeCheck className="h-3.5 w-3.5" />
                {t("authoritative")}
              </span>
            )}
            <span className="inline-flex items-center">
              {t("lastUpdated", { date: lastUpdated })}
            </span>
          </div>
        </header>

        <main className="prose prose-base sm:prose-lg dark:prose-invert prose-headings:font-serif prose-a:text-accent hover:prose-a:text-accent/80 prose-a:transition-colors max-w-none">
          <MDXRemote source={doc.content} />
        </main>
      </div>
    </div>
  );
}
