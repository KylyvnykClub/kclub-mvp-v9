"use client";

import { useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { X } from "lucide-react";
import {
  createCheckoutSessionAction,
  createPortalSessionAction,
} from "@/actions/stripe";
import {
  deleteCompanyImageAction,
  removeCompanyLogoAction,
  uploadCompanyImageAction,
  uploadCompanyLogoAction,
} from "@/actions/company-images";
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
import {
  COMPANY_GALLERY_MAX_IMAGES,
  companyImageServePath,
} from "@/lib/company-image-path";
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

              {company.moderationStatus !== "rejected" && (
                <>
                  <LogoSection
                    companyId={company.id}
                    logoUrl={company.logoUrl}
                    name={company.name}
                  />
                  <GallerySection
                    companyId={company.id}
                    images={company.images}
                  />
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function LogoSection({
  companyId,
  logoUrl,
  name,
}: {
  companyId: string;
  logoUrl: string | null;
  name: string;
}) {
  const t = useTranslations("dashboard");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const errorKeys: Record<string, string> = {
    too_large: "avatarErrorTooLarge",
    unreadable: "avatarErrorUnreadable",
    unsupported_format: "avatarErrorUnsupportedFormat",
    processing_failed: "avatarErrorProcessingFailed",
  };

  const report = (code: string | undefined) =>
    setError(code ? t(errorKeys[code] ?? "avatarErrorProcessingFailed") : null);

  const upload = (file: File) => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("logo", file);
      const result = await uploadCompanyLogoAction(companyId, formData);
      report(result.success ? undefined : result.error);
      if (fileRef.current) fileRef.current.value = "";
    });
  };

  const remove = () => {
    startTransition(async () => {
      const result = await removeCompanyLogoAction(companyId);
      report(result.success ? undefined : result.error);
    });
  };

  return (
    <div className="mt-6 space-y-3 border-t border-border/50 pt-6">
      <p className="text-sm font-medium">{t("logoSectionLabel")}</p>

      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}

      <div className="flex items-center gap-4">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- own-origin, already re-encoded bytes (ADR 0023)
          <img
            src={logoUrl}
            alt=""
            className="size-16 border border-border object-cover"
          />
        ) : (
          <div
            className="flex size-16 items-center justify-center border border-border bg-muted font-serif text-2xl font-bold text-muted-foreground"
            aria-hidden="true"
          >
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="space-y-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={busy}
            aria-label={t("logoAdd")}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
            className="block w-full max-w-xs text-sm text-muted-foreground file:mr-3 file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-bold file:uppercase file:tracking-[0.1em]"
          />
          <p className="text-xs text-muted-foreground">
            {busy ? t("galleryUploading") : t("logoHint")}
          </p>
          {logoUrl && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              {t("logoRemove")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function GallerySection({
  companyId,
  images,
}: {
  companyId: string;
  images: { id: string }[];
}) {
  const t = useTranslations("dashboard");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const errorKeys: Record<string, string> = {
    gallery_full: "galleryErrorFull",
    too_large: "avatarErrorTooLarge",
    unreadable: "avatarErrorUnreadable",
    unsupported_format: "avatarErrorUnsupportedFormat",
    processing_failed: "avatarErrorProcessingFailed",
  };

  const report = (code: string | undefined) =>
    setError(code ? t(errorKeys[code] ?? "avatarErrorProcessingFailed") : null);

  const upload = (file: File) => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("image", file);
      const result = await uploadCompanyImageAction(companyId, formData);
      report(result.success ? undefined : result.error);
      if (fileRef.current) fileRef.current.value = "";
    });
  };

  const remove = (imageId: string) => {
    startTransition(async () => {
      const result = await deleteCompanyImageAction(imageId);
      report(result.success ? undefined : result.error);
    });
  };

  return (
    <div className="mt-6 space-y-3 border-t border-border/50 pt-6">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium">{t("galleryLabel")}</p>
        <p className="text-xs text-muted-foreground">
          {t("galleryCount", {
            count: images.length,
            max: COMPANY_GALLERY_MAX_IMAGES,
          })}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}

      {images.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {images.map((image) => (
            <li key={image.id} className="group relative aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element -- own-origin, already re-encoded bytes */}
              <img
                src={companyImageServePath(image.id)}
                alt=""
                className="size-full rounded-sm object-cover"
              />
              <button
                type="button"
                onClick={() => remove(image.id)}
                disabled={busy}
                aria-label={t("galleryDelete")}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {images.length < COMPANY_GALLERY_MAX_IMAGES && (
        <div className="space-y-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={busy}
            aria-label={t("galleryAdd")}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
            className="block w-full max-w-xs text-sm text-muted-foreground file:mr-3 file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-bold file:uppercase file:tracking-[0.1em]"
          />
          <p className="text-xs text-muted-foreground">
            {busy
              ? t("galleryUploading")
              : t("galleryHint", { max: COMPANY_GALLERY_MAX_IMAGES })}
          </p>
        </div>
      )}
    </div>
  );
}
