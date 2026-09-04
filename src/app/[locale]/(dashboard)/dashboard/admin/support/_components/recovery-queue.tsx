"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { closePasswordResetRequestAction } from "@/actions/admin-password-reset-requests";
import type { PasswordResetRequestView } from "@/data/password-reset-requests";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * Members waiting for their password to be reset (FR-006, ADR 0031).
 *
 * Two controls, and neither of them resets anything. "Open" goes to the member
 * where the owner-only reset lives; "handled" and "dismissed" only take the
 * row off this screen. Keeping the reset where it already is means it keeps the
 * gate and the audit entry it already has (ADR 0018).
 */
export function RecoveryQueue({
  requests,
  locale,
}: {
  requests: PasswordResetRequestView[];
  locale: string;
}) {
  const t = useTranslations("admin.support");
  const [pending, start] = useTransition();
  const [closed, setClosed] = useState<string[]>([]);

  const open = requests.filter((request) => !closed.includes(request.id));

  if (open.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("queueClear")}</p>;
  }

  function close(id: string, outcome: "handled" | "dismissed") {
    start(async () => {
      const result = await closePasswordResetRequestAction(id, outcome);

      if (result.status === "closed" || result.status === "gone") {
        setClosed((previous) => [...previous, id]);
        return;
      }

      toast.error(t("recoveryCloseFailed"));
    });
  }

  return (
    <ul className="divide-y divide-border border border-border">
      {open.map((request) => (
        <li
          key={request.id}
          className="flex flex-wrap items-center justify-between gap-3 p-4"
        >
          <div className="min-w-0">
            <p className="truncate font-medium">{request.displayName}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {request.phone}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(request.createdAt))}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/dashboard/admin/members?q=${request.phone}`}>
                {t("recoveryOpenMember")}
              </Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => close(request.id, "handled")}
            >
              {t("recoveryHandled")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => close(request.id, "dismissed")}
            >
              {t("recoveryDismissed")}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
