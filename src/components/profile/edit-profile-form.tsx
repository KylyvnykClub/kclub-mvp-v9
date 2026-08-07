"use client";

import { useActionState } from "react";
import { updateProfileAction } from "@/actions/profile";
import type { ProfileView } from "@/data/profiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function EditProfileForm({ profile }: { profile: ProfileView }) {
  const [state, action, pending] = useActionState(updateProfileAction, null);

  return (
    <form action={action} className="space-y-4">
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state?.success && (
        <p className="text-sm text-green-500">Profile updated successfully</p>
      )}

      <div className="space-y-2">
        <Label htmlFor="avatarUrl">Avatar URL</Label>
        <Input
          id="avatarUrl"
          name="avatarUrl"
          placeholder="https://example.com/avatar.jpg"
          defaultValue={profile?.avatarUrl || ""}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          name="bio"
          placeholder="Tell us about yourself..."
          defaultValue={profile?.bio || ""}
          rows={4}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="industry">Industry</Label>
          <Input
            id="industry"
            name="industry"
            placeholder="e.g. Technology"
            defaultValue={profile?.industry || ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            name="location"
            placeholder="e.g. Kyiv, Ukraine"
            defaultValue={profile?.location || ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="linkedin">LinkedIn URL</Label>
        <Input
          id="linkedin"
          name="linkedin"
          placeholder="https://linkedin.com/in/..."
          defaultValue={profile?.socialLinks?.linkedin || ""}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="twitter">Twitter / X URL</Label>
        <Input
          id="twitter"
          name="twitter"
          placeholder="https://twitter.com/..."
          defaultValue={profile?.socialLinks?.twitter || ""}
        />
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving..." : "Save Profile"}
      </Button>
    </form>
  );
}
