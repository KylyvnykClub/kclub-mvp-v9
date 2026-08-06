import { getAllLegalDocuments } from "@/lib/mdx";
import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

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
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-700">
        <Link
          href={`/${locale}`}
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-accent transition-colors mb-8"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("backToHome")}
        </Link>

        <header className="mb-10 border-b border-border/40 pb-8">
          <h1 className="text-4xl sm:text-5xl font-serif font-bold tracking-tight text-foreground mb-4">
            {t("title")}
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            {t("indexDescription")}
          </p>
        </header>

        <ul className="grid gap-3">
          {documents.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/${locale}/legal/${doc.id}`}
                className="group flex items-center justify-between rounded-xl border border-border/40 bg-card p-5 transition-colors hover:border-accent/50 hover:bg-accent/5"
              >
                <span className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground group-hover:text-accent" />
                  <span className="font-medium text-foreground">
                    {doc.title}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("version", { version: doc.version })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
