"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  removeDraftLogoAction,
  uploadDraftLogoAction,
} from "@/actions/company-draft-media";
import { Label } from "@/components/ui/label";
import { RequiredMark } from "@/components/ui/required-mark";
import { uploadImageSafely } from "@/lib/client-image-upload";
import { DRAFT_LOGO_SLOT, draftMediaServePath } from "@/lib/draft-media-path";
import { FILE_INPUT_CLASS } from "./company-fields";
import { useImageCrop } from "@/components/media/image-crop-dialog";

/**
 * The logo staged under the applicant's draft prefix (ADR 0024).
 *
 * Only usable by someone who already has an account, because the staging
 * prefix is their member id. The public partner application therefore does
 * not render this - it uploads to the company once the account exists.
 */

const IMAGE_ERROR_KEYS: Record<string, string> = {
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
  const { frame, cropDialog } = useImageCrop();

  const report = (code: string | undefined) =>
    setError(
      code ? t(IMAGE_ERROR_KEYS[code] ?? "avatarErrorProcessingFailed") : null,
    );

  return (
    <div className="space-y-2">
      {cropDialog}
      <Label htmlFor="draftLogo">
        {t("logoSectionLabel")}
        <RequiredMark />
      </Label>
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
            className="size-16 border border-border bg-muted object-contain p-1"
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
              void (async () => {
                const picked = e.currentTarget.files?.[0];
                if (!picked) return;
                const file = await frame(picked, "logo");
                if (!file) {
                  if (fileRef.current) fileRef.current.value = "";
                  return;
                }
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
              })();
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
