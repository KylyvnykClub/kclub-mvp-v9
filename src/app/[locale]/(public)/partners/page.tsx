import { setRequestLocale, getTranslations } from "next-intl/server";
import { getPartnersListAction } from "@/actions/company";
import { getCurrentMember } from "@/actions/session";
import { isFeatureEnabled } from "@/actions/feature-flags";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <div className="text-center space-y-4">
        <h1 className="font-serif text-4xl md:text-5xl font-bold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          {t("subtitle")}
        </p>

        <form className="max-w-2xl mx-auto mt-6 flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q || ""}
            placeholder={t("searchPlaceholder")}
            className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <input
            type="text"
            name="country"
            defaultValue={country || ""}
            placeholder={t("countryPlaceholder")}
            className="w-full sm:w-32 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <input
            type="text"
            name="city"
            defaultValue={city || ""}
            placeholder={t("cityPlaceholder")}
            className="w-full sm:w-32 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          >
            {t("filter")}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {partners.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground bg-muted/10 border border-border/50">
            {t("empty")}
          </div>
        ) : (
          partners.map((partner) => (
            <Link
              key={partner.id}
              href={`/${locale}/partners/${partner.slug}`}
              className="group block"
            >
              <Card className="h-full bg-card/50 backdrop-blur-sm border-border/50 rounded-none shadow-sm transition-all duration-300 hover:border-accent/50 hover:bg-card">
                <CardHeader className="pb-4">
                  <div className="flex items-center space-x-4 mb-2">
                    {partner.logoUrl ? (
                      <div className="w-12 h-12 rounded-none bg-muted/30 overflow-hidden flex-shrink-0 border border-border/50">
                        <img
                          src={partner.logoUrl}
                          alt={partner.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 bg-accent/10 text-accent flex items-center justify-center font-serif text-xl border border-accent/20">
                        {partner.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <CardTitle className="font-serif text-lg group-hover:text-accent transition-colors">
                        {partner.name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {partner.businessCategory?.category}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                    {partner.description || t("noDescription")}
                  </p>

                  {partner.discount && (
                    <div className="mt-auto">
                      <Badge
                        variant="default"
                        className="w-full justify-center py-1.5 rounded-none font-medium"
                      >
                        {partner.discount}
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
