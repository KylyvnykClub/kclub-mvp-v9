import { getTranslations } from "next-intl/server";
import { getPublicShowcasePartners } from "@/actions/company";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Tag } from "lucide-react";

export async function ShowcaseSection() {
  const t = await getTranslations("home.showcase");
  const partners = await getPublicShowcasePartners();
  if (!partners || partners.length === 0) return null;

  return (
    <section className="py-24 bg-muted/50 border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <h2 className="text-3xl font-serif font-bold tracking-tight text-foreground sm:text-4xl">
            {t("title")}
          </h2>
          <p className="text-lg text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {partners.map((partner) => (
            <Card
              key={partner.id}
              className="overflow-hidden hover:shadow-md transition-all duration-300 bg-background/50 backdrop-blur-sm border-border"
            >
              <div className="h-32 bg-primary/5 relative flex items-center justify-center p-4 border-b border-border/50">
                {partner.logoUrl ? (
                  <img
                    src={partner.logoUrl}
                    alt={partner.name}
                    className="max-h-full max-w-full object-contain"
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
                      {partner.city || t("fallbackCity")},{" "}
                      {partner.country || t("fallbackCountry")}
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
                  {partner.description || t("fallbackDescription")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
