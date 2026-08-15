"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  listOwnSessionsAction,
  revokeOtherSessionsAction,
  revokeOwnSessionAction,
  type SessionListItem,
} from "@/actions/sessions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * The member's active sessions, and the buttons that end them (FR-007).
 *
 * The current session is listed but cannot be ended here: signing yourself out
 * from a device list reads as a bug, and there is already a sign-out button.
 */

/** A user agent string is not something to show a person verbatim. */
function describeDevice(userAgent: string): string {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : /Firefox\//.test(userAgent)
            ? "Firefox"
            : null;

  const platform = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad|iOS/.test(userAgent)
      ? "iOS"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null;

  if (browser && platform) return `${browser} · ${platform}`;
  return browser ?? platform ?? userAgent.slice(0, 40);
}

export function ActiveSessions({ locale }: { locale: string }) {
  const t = useTranslations("sessions");
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function refresh() {
    setSessions(await listOwnSessionsAction());
  }

  useEffect(() => {
    void refresh();
  }, []);

  function endOne(sessionId: string) {
    setError(null);
    startTransition(async () => {
      const result = await revokeOwnSessionAction(sessionId);
      if (!result.success) setError(result.error ?? null);
      await refresh();
    });
  }

  function endOthers() {
    setError(null);
    startTransition(async () => {
      const result = await revokeOtherSessionsAction();
      if (!result.success) setError(result.error ?? null);
      await refresh();
    });
  }

  if (sessions === null) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  const others = sessions.filter((session) => !session.current);
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>

      {error && (
        <p
          role="alert"
          className="border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive"
        >
          {error}
        </p>
      )}

      <ul className="divide-y divide-border border border-border">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="flex flex-wrap items-center justify-between gap-3 p-3"
          >
            <div className="space-y-1">
              <p className="text-sm font-semibold">
                {describeDevice(session.userAgent)}
                {session.current && (
                  <Badge className="ml-2 rounded-none" variant="secondary">
                    {t("currentBadge")}
                  </Badge>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {session.ipAddress} ·{" "}
                {t("lastSeen", {
                  when: formatter.format(new Date(session.lastSeenAt)),
                })}
              </p>
            </div>

            {!session.current && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => endOne(session.id)}
              >
                {t("endSession")}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {others.length > 0 && (
        <Button
          type="button"
          variant="destructive"
          disabled={pending}
          onClick={endOthers}
        >
          {t("endAllOthers", { count: others.length })}
        </Button>
      )}
    </div>
  );
}
