"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

import {
  deleteDraftImageAction,
  removeDraftLogoAction,
  uploadDraftImageAction,
  uploadDraftLogoAction,
} from "@/actions/company-draft-media";
import { Label } from "@/components/ui/label";
import { uploadImageSafely } from "@/lib/client-image-upload";
import { COMPANY_GALLERY_MAX_IMAGES } from "@/lib/company-image-path";
import { DRAFT_LOGO_SLOT, draftMediaServePath } from "@/lib/draft-media-path";
import { FILE_INPUT_CLASS } from "./company-fields";

/**
 * Logo and photos staged under the applicant's draft prefix (ADR 0024).
 *
 * Only usable by someone who already has an account, because the staging
 * prefix is their member id. The public partner application therefore does
 * not render this - it uploads to the company once the account exists.
 */

const IMAGE_ERROR_KEYS: Record<string, string> = {
  gallery_full: "galleryErrorFull",
  too_large: "avatarErrorTooLarge",
  unreadable: "avatarErrorUnreadable",
  unsupported_format: "avatarErrorUnsupportedFormat",
  processing_failed: "avatarErrorProcessingFailed",
  upload_failed: "avatarErrorUploadFailed",
};

export function DraftLogoField({
  staged,
  onChange,
}: {
  staged: boolean;
  onChange: (staged: boolean) => void;
}) {
  const t = useTranslations("dashboard");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const report = (code: string | undefined) =>
    setError(
      code ? t(IMAGE_ERROR_KEYS[code] ?? "avatarErrorProcessingFailed") : null,
    );

  return (
    <div className="space-y-2">
      <Label htmlFor="draftLogo">{t("logoSectionLabel")}</Label>
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
      <div className="flex items-center gap-4">
        {staged ? (
          // eslint-disable-next-line @next/next/no-img-element -- own-origin staged preview (ADR 0024)
          <img
            src={`${draftMediaServePath(DRAFT_LOGO_SLOT)}?v=${version}`}
            alt=""
            className="size-16 border border-border object-cover"
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
            id="draftLogo"
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={busy}
            className={FILE_INPUT_CLASS}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              startTransition(async () => {
                const formData = new FormData();
                formData.set("logo", file);
                const guarded = await uploadImageSafely(file, () =>
                  uploadDraftLogoAction(formData),
                );
                if (fileRef.current) fileRef.current.value = "";
                if (!guarded.ok) {
                  report(guarded.code);
                  return;
                }
                const result = guarded.result;
                report(result.success ? undefined : result.error);
                if (result.success) {
                  onChange(true);
                  setVersion((v) => v + 1);
                }
              });
            }}
          />
          <p className="text-xs text-muted-foreground">
            {busy ? t("galleryUploading") : t("logoHint")}
          </p>
          {staged && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                startTransition(async () => {
                  const result = await removeDraftLogoAction();
                  report(result.success ? undefined : result.error);
                  if (result.success) onChange(false);
                })
              }
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

export function DraftGalleryField({
  imageIds,
  onChange,
}: {
  imageIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const t = useTranslations("dashboard");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const report = (code: string | undefined) =>
    setError(
      code ? t(IMAGE_ERROR_KEYS[code] ?? "avatarErrorProcessingFailed") : null,
    );

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <Label htmlFor="draftImage">{t("galleryLabel")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("galleryCount", {
            count: imageIds.length,
            max: COMPANY_GALLERY_MAX_IMAGES,
          })}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
      {imageIds.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {imageIds.map((id) => (
            <li key={id} className="group relative aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element -- own-origin staged preview (ADR 0024) */}
              <img
                src={draftMediaServePath(id)}
                alt=""
                className="size-full rounded-sm object-cover"
              />
              <button
                type="button"
                disabled={busy}
                aria-label={t("galleryDelete")}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteDraftImageAction(id);
                    report(result.success ? undefined : result.error);
                    if (result.success)
                      onChange(imageIds.filter((x) => x !== id));
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
      {imageIds.length < COMPANY_GALLERY_MAX_IMAGES && (
        <div className="space-y-1">
          <input
            id="draftImage"
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={busy}
            className={FILE_INPUT_CLASS}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              startTransition(async () => {
                const formData = new FormData();
                formData.set("image", file);
                const guarded = await uploadImageSafely(file, () =>
                  uploadDraftImageAction(formData),
                );
                if (fileRef.current) fileRef.current.value = "";
                if (!guarded.ok) {
                  report(guarded.code);
                  return;
                }
                const result = guarded.result;
                report(result.success ? undefined : result.error);
                if (result.success && result.imageId) {
                  onChange([...imageIds, result.imageId]);
                }
              });
            }}
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
