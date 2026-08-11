import { setRequestLocale, getTranslations } from "next-intl/server";
import { getPartnersListAction } from "@/actions/company";
import { getCurrentMember } from "@/actions/session";
import { isFeatureEnabled } from "@/actions/feature-flags";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BadgeCheck, MapPin, Search } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "catalogue" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function CatalogueDirectoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; country?: string; city?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("catalogue");

  const session = await getCurrentMember();
  if (!session?.member) {
    const isPublic = await isFeatureEnabled("public_catalogue");
    if (!isPublic) {
      redirect(`/${locale}/login`);
    }
  }

  const { q, country, city } = await searchParams;
  const partners = await getPartnersListAction({ query: q, country, city });

  return (
    <main className="border-b border-border bg-background">
      <section className="border-b border-border bg-zinc-950 py-16 text-white sm:py-20">
        <div className="kclub-shell">
          <p className="kclub-eyebrow !text-white/55">KCLUB DIRECTORY</p>
          <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_0.75fr] lg:items-end">
            <div>
              <h1 className="text-5xl font-black uppercase leading-[0.92] tracking-[-0.045em] sm:text-7xl">
                {t("title")}
              </h1>
              <p className="mt-6 max-w-2xl text-lg font-light leading-8 text-white/65">
                {t("subtitle")}
              </p>
            </div>
            <div className="border-l border-accent pl-5 text-sm font-light leading-7 text-white/60">
              <p>{t("contactsMembersOnly")}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="kclub-shell py-10 sm:py-12">
        <form className="grid gap-px border border-border bg-border lg:grid-cols-[1.5fr_0.75fr_0.75fr_auto]">
          <label className="group flex min-h-20 flex-col justify-center bg-background px-4 py-3 transition-colors focus-within:bg-muted/50 sm:px-5">
            <span className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <Search className="size-3.5" aria-hidden="true" />
              {t("searchPlaceholder")}
            </span>
            <input
              type="text"
              name="q"
              defaultValue={q || ""}
              className="h-8 w-full bg-transparent text-base font-medium outline-none placeholder:text-muted-foreground/60"
              placeholder={t("searchPlaceholder")}
            />
          </label>
          <label className="group flex min-h-20 flex-col justify-center bg-background px-4 py-3 transition-colors focus-within:bg-muted/50 sm:px-5">
            <span className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <MapPin className="size-3.5" aria-hidden="true" />
              {t("countryPlaceholder")}
            </span>
            <input
              type="text"
              name="country"
              defaultValue={country || ""}
              className="h-8 w-full bg-transparent text-base font-medium outline-none placeholder:text-muted-foreground/60"
              placeholder={t("countryPlaceholder")}
            />
          </label>
          <label className="group flex min-h-20 flex-col justify-center bg-background px-4 py-3 transition-colors focus-within:bg-muted/50 sm:px-5">
            <span className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <MapPin className="size-3.5" aria-hidden="true" />
              {t("cityPlaceholder")}
            </span>
            <input
              type="text"
              name="city"
              defaultValue={city || ""}
              className="h-8 w-full bg-transparent text-base font-medium outline-none placeholder:text-muted-foreground/60"
              placeholder={t("cityPlaceholder")}
            />
          </label>
          <button
            type="submit"
            className="inline-flex min-h-20 items-center justify-center gap-3 bg-accent px-8 text-xs font-black uppercase tracking-[0.18em] text-accent-foreground transition-colors hover:bg-[#b49126] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("filter")}
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </button>
        </form>
      </section>

      <section className="kclub-shell pb-20">
        <div className="grid border-l border-t border-border md:grid-cols-2 lg:grid-cols-3">
          {partners.length === 0 ? (
            <div className="col-span-full min-h-64 border-b border-r border-border bg-muted/30 p-8 sm:p-12">
              <p className="kclub-eyebrow">{t("filter")}</p>
              <p className="mt-6 max-w-xl text-3xl font-black uppercase leading-tight tracking-[-0.02em]">
                {t("empty")}
              </p>
            </div>
          ) : (
            partners.map((partner) => (
              <Link
                key={partner.id}
                href={`/${locale}/directory/${partner.slug}`}
                className="group relative flex min-h-[360px] flex-col justify-between border-b border-r border-border bg-background p-6 transition-colors duration-200 hover:bg-muted/40 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-7"
              >
                <div>
                  <div className="flex items-start justify-between gap-5">
                    {partner.logoUrl ? (
                      <div className="relative flex size-16 shrink-0 items-center justify-center border border-border bg-muted/20 p-2">
                        <Image
                          src={partner.logoUrl}
                          alt={partner.name}
                          fill
                          unoptimized
                          sizes="64px"
                          className="object-contain p-2"
                        />
                      </div>
                    ) : (
                      <div className="flex size-16 shrink-0 items-center justify-center border border-accent/30 bg-accent/10 text-2xl font-black text-accent">
                        {partner.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <ArrowUpRight
                      className="size-5 text-muted-foreground transition-colors group-hover:text-accent"
                      aria-hidden="true"
                    />
                  </div>

                  <div className="mt-10">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      {partner.businessCategory?.block}
                    </p>
                    <h2 className="mt-3 text-2xl font-black uppercase leading-tight tracking-[-0.025em] transition-colors group-hover:text-accent">
                      {partner.name}
                    </h2>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {partner.businessCategory?.category}
                    </p>
                    <p className="mt-5 line-clamp-4 text-sm font-light leading-6 text-muted-foreground">
                      {partner.description || t("noDescription")}
                    </p>
                  </div>
                </div>

                <div className="mt-8 flex items-center justify-between gap-4 border-t border-border pt-5">
                  <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    <BadgeCheck
                      className="size-4 text-accent"
                      aria-hidden="true"
                    />
                    KCLUB
                  </span>
                  {partner.discount && (
                    <span className="max-w-[55%] text-right text-xs font-black uppercase tracking-[0.12em] text-accent">
                      {partner.discount}
                    </span>
                  )}
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
