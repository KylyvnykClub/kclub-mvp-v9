"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import type { NotificationRow } from "@/data/notifications";

/**
 * The member's inbox (FR-099).
 *
 * Every row is rendered from its `kind` and `params` through next-intl at read
 * time, never from stored prose — a member who switches language sees their
 * whole history switch with them (FR-090, ADR 0020).
 */
export function NotificationList({
  notifications,
  locale,
}: {
  notifications: NotificationRow[];
  locale: string;
}) {
  const t = useTranslations("notification");
  const [pending, start] = useTransition();

  const unread = notifications.filter((row) => !row.readAt).length;

  if (notifications.length === 0) {
    return (
      <p className="border border-border/50 p-6 text-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {t("unreadSummary", { count: unread })}
        </p>
        {unread > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await markAllNotificationsReadAction();
                if (!result.success) toast.error(t("markFailed"));
              })
            }
          >
            {t("markAllRead")}
          </Button>
        )}
      </div>

      <ul className="divide-y divide-border/50 border border-border/50">
        {notifications.map((row) => {
          const params = (row.params ?? {}) as Record<string, string>;
          // A rejection carries the moderator's own words. No translation
          // reaches them, so they are quoted rather than folded into the
          // localised sentence around them (ADR 0020).
          const moderatorNote =
            row.kind === "company_rejected" ? params.reason : undefined;

          return (
            <li
              key={row.id}
              className={`flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between ${
                row.readAt ? "" : "bg-accent/5"
              }`}
            >
              <div className="space-y-1">
                <p className="text-sm">
                  {!row.readAt && (
                    <span
                      aria-hidden="true"
                      className="mr-2 inline-block size-2 rounded-full bg-accent align-middle"
                    />
                  )}
                  {t(row.kind, { ...params })}
                </p>
                {moderatorNote && (
                  <blockquote className="border-l-2 border-border pl-3 text-sm italic text-muted-foreground">
                    {moderatorNote}
                  </blockquote>
                )}
                {row.kind === "company_rejected" && (
                  // Worded conditionally on purpose: the inbox row is written
                  // before the refund runs and the refund may still be
                  // retrying via the outbox (ADR 0019), so this promises the
                  // policy rather than reporting a completed transfer.
                  <p className="text-sm text-muted-foreground">
                    {t("company_rejected_refund")}
                  </p>
                )}
                <time
                  dateTime={new Date(row.createdAt).toISOString()}
                  className="block text-[11px] uppercase tracking-[0.12em] text-muted-foreground"
                >
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(row.createdAt))}
                </time>
              </div>

              {!row.readAt && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  className="shrink-0 text-xs"
                  onClick={() =>
                    start(async () => {
                      const result = await markNotificationReadAction(row.id);
                      if (!result.success) toast.error(t("markFailed"));
                    })
                  }
                >
                  {t("markRead")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
