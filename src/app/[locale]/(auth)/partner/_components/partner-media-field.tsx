"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

import { Label } from "@/components/ui/label";
import { FILE_INPUT_CLASS } from "@/components/company/company-fields";
import { COMPANY_GALLERY_MAX_IMAGES } from "@/lib/company-image-path";

/**
 * Logo and photos on the public partner application (FR-109).
 *
 * The dashboard form stages media under the applicant's draft prefix, which is
 * their member id (ADR 0024). A business filling this page in has no member id
 * yet, so there is nowhere to stage to. The files are therefore held here
 * until the form is submitted and ride along in its FormData;
 * `attachApplicationMedia` processes them server-side through the same
 * re-encode pipeline every other upload uses.
 *
 * This component only picks and previews. It uploads nothing, which is what
 * keeps the pictures from racing the navigation the submit triggers.
 */

export type PartnerMedia = {
  logo: File | null;
  images: File[];
};

export const EMPTY_PARTNER_MEDIA: PartnerMedia = { logo: null, images: [] };

export function PartnerMediaField({
  media,
  onChange,
}: {
  media: PartnerMedia;
  onChange: (media: PartnerMedia) => void;
}) {
  const t = useTranslations("dashboard");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="partnerLogo">{t("logoSectionLabel")}</Label>
        <div className="flex items-center gap-4">
          {media.logo ? (
            <LocalPreview file={media.logo} className="size-16" />
          ) : (
            <div
              className="flex size-16 items-center justify-center border border-border bg-muted text-[10px] uppercase tracking-wider text-muted-foreground"
              aria-hidden="true"
            >
              {t("noLogoYet")}
            </div>
          )}
          <div className="space-y-1">
            <input
              id="partnerLogo"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className={FILE_INPUT_CLASS}
              onChange={(e) =>
                onChange({ ...media, logo: e.target.files?.[0] ?? null })
              }
            />
            <p className="text-xs text-muted-foreground">{t("logoHint")}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="partnerImage">{t("galleryLabel")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("galleryCount", {
              count: media.images.length,
              max: COMPANY_GALLERY_MAX_IMAGES,
            })}
          </p>
        </div>

        {media.images.length > 0 && (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {media.images.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="group relative aspect-square"
              >
                <LocalPreview file={file} className="size-full" />
                <button
                  type="button"
                  aria-label={t("galleryDelete")}
                  onClick={() =>
                    onChange({
                      ...media,
                      images: media.images.filter((_, i) => i !== index),
                    })
                  }
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {media.images.length < COMPANY_GALLERY_MAX_IMAGES && (
          <div className="space-y-1">
            <input
              id="partnerImage"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className={FILE_INPUT_CLASS}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                onChange({ ...media, images: [...media.images, file] });
                e.target.value = "";
              }}
            />
            <p className="text-xs text-muted-foreground">
              {t("galleryHint", { max: COMPANY_GALLERY_MAX_IMAGES })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A preview of a file that has not been uploaded anywhere. The object URL is
 * revoked when the preview goes away, or a long application leaks one per
 * picked file.
 */
function LocalPreview({ file, className }: { file: File; className: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!url) return <div className={`${className} bg-muted`} aria-hidden />;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- a blob: preview of a file that has not been uploaded
    <img
      src={url}
      alt=""
      className={`${className} border border-border object-cover`}
    />
  );
}
