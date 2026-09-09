"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  revokeJoinLinkAction,
  rotateJoinLinkAction,
} from "@/actions/join-link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface JoinLink {
  secret: string;
  createdAt: string;
}

/**
 * Read the current link, hang a new one, or close the door.
 *
 * Rotating replaces the link everyone was given, so the button says so before
 * it is pressed rather than after.
 */
export function JoinLinkPanel({
  initialLink,
  baseUrl,
  locale,
}: {
  initialLink: JoinLink | null;
  baseUrl: string;
  locale: string;
}) {
  const t = useTranslations("admin.joinLink");
  const [link, setLink] = useState<JoinLink | null>(initialLink);
  const [pending, startTransition] = useTransition();

  const url = link ? `${baseUrl}/${locale}/join/${link.secret}` : null;

  function rotate() {
    startTransition(async () => {
      try {
        const next = await rotateJoinLinkAction();
        setLink({
          secret: next.secret,
          createdAt: next.createdAt.toISOString(),
        });
        toast.success(t("rotated"));
      } catch {
        toast.error(t("failed"));
      }
    });
  }

  function revoke() {
    startTransition(async () => {
      try {
        await revokeJoinLinkAction();
        setLink(null);
        toast.success(t("revoked"));
      } catch {
        toast.error(t("failed"));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("currentTitle")}</CardTitle>
        <CardDescription>
          {url ? t("currentDescription") : t("noneDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {url ? (
          <div className="space-y-2">
            <code className="block break-all rounded-md border border-border bg-muted/40 p-3 text-sm">
              {url}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard
                  .writeText(url)
                  .then(() => toast.success(t("copied")))
                  .catch(() => toast.error(t("failed")));
              }}
            >
              {t("copy")}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noneBody")}</p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-3">
        <Button type="button" onClick={rotate} disabled={pending}>
          {link ? t("rotate") : t("create")}
        </Button>
        {link && (
          <Button
            type="button"
            variant="outline"
            onClick={revoke}
            disabled={pending}
          >
            {t("revoke")}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
