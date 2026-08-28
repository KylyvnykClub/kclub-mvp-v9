"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  createCheckoutSessionAction,
  createPortalSessionAction,
} from "@/actions/stripe";
import type { CompanyRow } from "@/data/companies";
import type { SubscriptionRow } from "@/data/billing";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { countryName } from "@/lib/countries";
import type { Locale } from "@/i18n/routing";

export function CompanyList({
  companies,
  subscriptions,
}: {
  companies: CompanyRow[];
  subscriptions: SubscriptionRow[];
}) {
  const t = useTranslations("billing");
  const tCompany = useTranslations("company");
  const locale = useLocale() as Locale;
  const [isPending, startTransition] = useTransition();

  const formatLabels = {
    offline_only: tCompany("businessFormatOffline"),
    online_only: tCompany("businessFormatOnline"),
    online_offline: tCompany("businessFormatHybrid"),
    on_site_service: tCompany("businessFormatOnSite"),
  } as const;

  const handleCheckout = (companyId: string) => {
    startTransition(async () => {
      try {
        await createCheckoutSessionAction(companyId);
      } catch {
        alert(t("checkoutFailed"));
      }
    });
  };

  const handlePortal = () => {
    startTransition(async () => {
      try {
        await createPortalSessionAction();
      } catch {
        alert(t("portalFailedAlert"));
      }
    });
  };

  const moderationLabel = (status: string) => {
    if (status === "approved") return tCompany("moderationApproved");
    if (status === "rejected") return tCompany("moderationRejected");
    return tCompany("moderationPending");
  };

  if (companies.length === 0) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50 shadow-sm">
        <CardContent className="p-8 text-center text-muted-foreground">
          {t("noCompanies")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {companies.map((company) => {
        const sub = subscriptions.find((s) => s.companyId === company.id);
        const isActive = sub?.status === "active";

        return (
          <Card
            key={company.id}
            className="bg-card/50 backdrop-blur-sm border-border/50 shadow-sm"
          >
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-xl font-serif text-accent-ink">
                    {company.name}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {t("moderationStatusLabel")}{" "}
                    <Badge variant="outline" className="uppercase text-[10px]">
                      {moderationLabel(company.moderationStatus)}
                    </Badge>
                  </CardDescription>
                </div>
                {isActive ? (
                  <Badge className="bg-green-500/20 text-green-500 hover:bg-green-500/30">
                    {t("paid")}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    {t("unpaid")}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isActive ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {t("activeListing")}
                  </p>
                  <Button
                    onClick={handlePortal}
                    disabled={isPending}
                    variant="outline"
                  >
                    {isPending ? t("loading") : t("manageButton")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {t("listingRequired")}
                  </p>
                  <Button
                    onClick={() => handleCheckout(company.id)}
                    disabled={isPending}
                    className="bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    {isPending ? t("loading") : t("subscribeListing")}
                  </Button>
                </div>
              )}

              {company.moderationStatus === "approved" && (
                <dl className="mt-6 grid gap-4 border-t border-border/50 pt-6 text-sm sm:grid-cols-2">
                  {company.legalName && (
                    <div>
                      <dt className="text-muted-foreground">
                        {tCompany("legalNameLabel")}
                      </dt>
                      <dd className="mt-1 font-medium">{company.legalName}</dd>
                    </div>
                  )}
                  {company.taxId && (
                    <div>
                      <dt className="text-muted-foreground">
                        {tCompany("taxIdLabel")}
                      </dt>
                      <dd className="mt-1 font-medium">{company.taxId}</dd>
                    </div>
                  )}
                  {company.website && (
                    <div>
                      <dt className="text-muted-foreground">
                        {tCompany("websiteLabel")}
                      </dt>
                      <dd className="mt-1 font-medium break-words">
                        {company.website}
                      </dd>
                    </div>
                  )}
                  {(company.contactEmail || company.contactPhone) && (
                    <div>
                      <dt className="text-muted-foreground">
                        {tCompany("contactEmailLabel")} /{" "}
                        {tCompany("contactPhoneLabel")}
                      </dt>
                      <dd className="mt-1 font-medium break-words">
                        {[company.contactEmail, company.contactPhone]
                          .filter(Boolean)
                          .join(" / ") || tCompany("notProvided")}
                      </dd>
                    </div>
                  )}
                  {company.description && (
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">
                        {tCompany("descriptionLabel")}
                      </dt>
                      <dd className="mt-1 whitespace-pre-wrap leading-6">
                        {company.description}
                      </dd>
                    </div>
                  )}
                  {company.specializationDescription && (
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">
                        {tCompany("specializationLabel")}
                      </dt>
                      <dd className="mt-1 whitespace-pre-wrap leading-6">
                        {company.specializationDescription}
                      </dd>
                    </div>
                  )}
                  {company.categories.length > 0 && (
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">
                        {tCompany("subcategoryLabel")}
                      </dt>
                      <dd className="mt-2 flex flex-wrap gap-2">
                        {company.categories.map((c) => (
                          <span
                            key={c.businessCategoryId}
                            className="inline-flex border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em]"
                          >
                            {c.businessCategory?.subcategory}
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                  {company.registrationCountryCode && (
                    <div>
                      <dt className="text-muted-foreground">
                        {tCompany("registrationCountryLabel")}
                      </dt>
                      <dd className="mt-1 font-medium">
                        {countryName(company.registrationCountryCode, locale)}
                      </dd>
                    </div>
                  )}
                  {company.businessFormat && (
                    <div>
                      <dt className="text-muted-foreground">
                        {tCompany("businessFormatLabel")}
                      </dt>
                      <dd className="mt-1 font-medium">
                        {formatLabels[company.businessFormat]}
                      </dd>
                    </div>
                  )}
                  {(company.city || company.administrativeLevel1) && (
                    <div>
                      <dt className="text-muted-foreground">
                        {tCompany("cityLabel")}
                      </dt>
                      <dd className="mt-1 font-medium">
                        {[
                          company.city,
                          company.administrativeLevel1,
                          company.administrativeLevel2,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </dd>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">
                      {tCompany("serviceCountriesLabel")}
                    </dt>
                    <dd className="mt-1 font-medium">
                      {company.servesWorldwide === 1
                        ? tCompany("worldwideLabel")
                        : company.serviceCountries
                            .map((sc) => countryName(sc.countryCode, locale))
                            .join(", ") || tCompany("notProvided")}
                    </dd>
                  </div>
                  {company.discount && (
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">
                        {tCompany("discountLabel")}
                      </dt>
                      <dd className="mt-1 font-medium">{company.discount}</dd>
                    </div>
                  )}
                </dl>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
