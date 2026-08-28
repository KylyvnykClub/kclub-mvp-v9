"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { updateProfileAction } from "@/actions/profile";
import type { ProfileView } from "@/data/profiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AVATAR_SERVE_PATH } from "@/lib/avatar-path";

const AVATAR_ERROR_KEYS: Record<string, string> = {
  too_large: "avatarErrorTooLarge",
  unreadable: "avatarErrorUnreadable",
  unsupported_format: "avatarErrorUnsupportedFormat",
  processing_failed: "avatarErrorProcessingFailed",
};

export function EditProfileForm({ profile }: { profile: ProfileView }) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(updateProfileAction, null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);

  const avatarErrorKey = state?.error
    ? AVATAR_ERROR_KEYS[state.error]
    : undefined;
  const errorMessage = avatarErrorKey
    ? t(avatarErrorKey)
    : (state?.error ?? null);

  const currentAvatarSrc =
    preview ?? (profile?.avatarUrl ? AVATAR_SERVE_PATH : null);

  return (
    <form action={action} className="space-y-4">
      {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
      {state?.success && (
        <p className="text-sm text-green-500">{t("profileUpdated")}</p>
      )}

      <div className="space-y-2">
        <Label htmlFor="avatar">{t("avatarLabel")}</Label>
        <div className="flex items-center gap-4">
          {currentAvatarSrc && !removeAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- own-origin, already re-encoded bytes; next/image adds nothing here
            <img
              src={currentAvatarSrc}
              alt=""
              className="size-16 rounded-full object-cover"
            />
          ) : (
            <div className="size-16 rounded-full bg-muted" aria-hidden="true" />
          )}
          <Input
            id="avatar"
            name="avatar"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="max-w-xs"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) {
                setPreview(null);
                return;
              }
              setRemoveAvatar(false);
              setPreview(URL.createObjectURL(file));
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t("avatarHint")}</p>
        {profile?.avatarUrl && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              name="removeAvatar"
              checked={removeAvatar}
              onChange={(e) => {
                setRemoveAvatar(e.target.checked);
                if (e.target.checked) setPreview(null);
              }}
            />
            {t("avatarRemoveLabel")}
          </label>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">{t("bioLabel")}</Label>
        <Textarea
          id="bio"
          name="bio"
          placeholder={t("bioPlaceholder")}
          defaultValue={profile?.bio || ""}
          rows={4}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="industry">{t("industryLabel")}</Label>
          <Input
            id="industry"
            name="industry"
            placeholder={t("industryPlaceholder")}
            defaultValue={profile?.industry || ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">{t("locationLabel")}</Label>
          <Input
            id="location"
            name="location"
            placeholder={t("locationPlaceholder")}
            defaultValue={profile?.location || ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="linkedin">{t("linkedinLabel")}</Label>
        <Input
          id="linkedin"
          name="linkedin"
          placeholder="https://linkedin.com/in/..."
          defaultValue={profile?.socialLinks?.linkedin || ""}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="twitter">{t("twitterLabel")}</Label>
        <Input
          id="twitter"
          name="twitter"
          placeholder="https://twitter.com/..."
          defaultValue={profile?.socialLinks?.twitter || ""}
        />
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? tCommon("saving") : t("saveProfile")}
      </Button>
    </form>
  );
}
