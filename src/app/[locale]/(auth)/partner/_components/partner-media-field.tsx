"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import { RequiredMark } from "@/components/ui/required-mark";
import { FILE_INPUT_CLASS } from "@/components/company/company-fields";
import { useImageCrop } from "@/components/media/image-crop-dialog";

/**
 * The logo on the public partner application (FR-109).
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
};

export const EMPTY_PARTNER_MEDIA: PartnerMedia = { logo: null };

export function PartnerMediaField({
  media,
  onChange,
}: {
  media: PartnerMedia;
  onChange: (media: PartnerMedia) => void;
}) {
  const t = useTranslations("dashboard");
  const { frame, cropDialog } = useImageCrop();

  return (
    <div className="space-y-6">
      {cropDialog}
      <div className="space-y-2">
        <Label htmlFor="partnerLogo">
          {t("logoSectionLabel")}
          <RequiredMark />
        </Label>
        <div className="flex items-center gap-4">
          {media.logo ? (
            <LocalPreview
              file={media.logo}
              className="size-16 bg-muted object-contain p-1"
            />
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
              onChange={(e) => {
                void (async () => {
                  const input = e.currentTarget;
                  const file = input.files?.[0];
                  if (!file) return;
                  const framed = await frame(file, "logo");
                  input.value = "";
                  if (framed) onChange({ ...media, logo: framed });
                })();
              }}
            />
            <p className="text-xs text-muted-foreground">{t("logoHint")}</p>
          </div>
        </div>
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
    <img src={url} alt="" className={`${className} border border-border`} />
  );
}
