"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { logoutAction } from "@/actions/auth";

/**
 * Sign out from the dues screen.
 *
 * A client component rather than a form action, for the same reason the
 * dashboard header is one: `logoutAction` answers `{ success }` rather than
 * redirecting, so somebody has to send the browser onwards afterwards.
 */
export function SignOutButton() {
  const t = useTranslations("membership");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await logoutAction();
          router.push(`/${locale}/login`);
        })
      }
      className="font-bold uppercase tracking-[0.12em] hover:text-foreground disabled:opacity-60"
    >
      {t("signOut")}
    </button>
  );
}
