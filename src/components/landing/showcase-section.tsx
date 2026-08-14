import { getTranslations } from "next-intl/server";
import { getPublicShowcasePartners } from "@/actions/company";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Tag } from "lucide-react";
import Image from "next/image";
import type { PartnerCompanyView } from "@/data/companies";

function PartnerCard({
  partner,
  fallbackCity,
  fallbackCountry,
  fallbackDescription,
}: {
  partner: PartnerCompanyView;
  fallbackCity: string;
  fallbackCountry: string;
  fallbackDescription: string;
}) {
  return (
    <Card className="overflow-hidden hover:shadow-md transition-all duration-300 bg-background/50 backdrop-blur-sm border-border">
      <div className="h-32 bg-primary/5 relative flex items-center justify-center p-4 border-b border-border/50">
        {partner.logoUrl ? (
          <Image
            src={partner.logoUrl}
            alt={partner.name}
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-contain p-4"
          />
        ) : (
          <span className="font-serif text-2xl font-bold text-muted-foreground/30">
            {partner.name}
          </span>
        )}
      </div>
      <CardContent className="p-6">
        <div className="mb-4">
          <h3
            className="text-xl font-bold font-serif mb-1 truncate"
            title={partner.name}
          >
            {partner.name}
          </h3>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span className="truncate">
              {partner.city || fallbackCity},{" "}
              {partner.country || fallbackCountry}
            </span>
          </div>
        </div>
        {partner.discount && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium border border-accent/20 mb-4 w-full">
            <Tag className="w-3 h-3 flex-shrink-0" />
            <span className="truncate" title={partner.discount}>
              {partner.discount}
            </span>
          </div>
        )}
        <p className="text-sm text-muted-foreground line-clamp-2">
          {partner.description || fallbackDescription}
        </p>
      </CardContent>
    </Card>
  );
}

export async function ShowcaseSection() {
  const t = await getTranslations("home.showcase");
  const { top, featured } = await getPublicShowcasePartners();

  if (top.length === 0 && featured.length === 0) return null;

  const fallbackCity = t("fallbackCity");
  const fallbackCountry = t("fallbackCountry");
  const fallbackDescription = t("fallbackDescription");

  return (
    <section className="py-24 bg-muted/50 border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <h2 className="text-3xl font-serif font-bold tracking-tight text-foreground sm:text-4xl">
            {t("title")}
          </h2>
          <p className="text-lg text-muted-foreground">{t("subtitle")}</p>
        </div>

        {top.length > 0 && (
          <div className="space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground text-center">
              {t("topTitle")}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {top.map((partner) => (
                <PartnerCard
                  key={partner.id}
                  partner={partner}
                  fallbackCity={fallbackCity}
                  fallbackCountry={fallbackCountry}
                  fallbackDescription={fallbackDescription}
                />
              ))}
            </div>
          </div>
        )}

        {featured.length > 0 && (
          <div className="space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground text-center">
              {t("featuredTitle")}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featured.map((partner) => (
                <PartnerCard
                  key={partner.id}
                  partner={partner}
                  fallbackCity={fallbackCity}
                  fallbackCountry={fallbackCountry}
                  fallbackDescription={fallbackDescription}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
