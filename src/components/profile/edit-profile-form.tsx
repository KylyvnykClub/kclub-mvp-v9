"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateProfileAction } from "@/actions/profile";
import type { ProfileView } from "@/data/profiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function EditProfileForm({ profile }: { profile: ProfileView }) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(updateProfileAction, null);

  return (
    <form action={action} className="space-y-4">
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state?.success && (
        <p className="text-sm text-green-500">{t("profileUpdated")}</p>
      )}

      <div className="space-y-2">
        <Label htmlFor="avatarUrl">{t("avatarLabel")}</Label>
        <Input
          id="avatarUrl"
          name="avatarUrl"
          placeholder="https://example.com/avatar.jpg"
          defaultValue={profile?.avatarUrl || ""}
        />
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
