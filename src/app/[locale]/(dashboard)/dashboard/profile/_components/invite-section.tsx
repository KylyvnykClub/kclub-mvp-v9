"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  rotateMyInviteLinkAction,
  type InviteProgramme,
} from "@/actions/invite-link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { InviteLinkKind } from "@/domain/invites";

/**
 * The invite programme tab (FR-122, FR-125, ADR 0042). Client-side only for
 * the copy and rotate buttons; what each link costs the newcomer was decided
 * on the server from the member's standing now.
 */
export function InviteSection({
  programme,
  baseUrl,
  locale,
}: {
  programme: InviteProgramme | null;
  baseUrl: string;
  locale: string;
}) {
  const t = useTranslations("invite");

  if (!programme) {
    return (
      <Card className="border-border bg-background shadow-none">
        <CardContent className="p-6 text-sm text-muted-foreground">
          {t("unavailable")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        {t("intro")}
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {programme.links.map((link) => (
          <InviteLinkCard
            key={link.kind}
            kind={link.kind}
            initialCode={link.code}
            waived={link.waived}
            baseUrl={baseUrl}
            locale={locale}
          />
        ))}
      </div>

      <Card className="border-border bg-background shadow-none">
        <CardHeader>
          <CardTitle className="text-xl font-black uppercase tracking-[-0.01em]">
            {t("countsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-px border-t border-border bg-border p-0 sm:grid-cols-2">
          <div className="bg-background p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {t("countMembers")}
            </p>
            <p className="mt-2 text-3xl font-black">
              {programme.counts.member}
            </p>
          </div>
          <div className="bg-background p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {t("countBusinesses")}
            </p>
            <p className="mt-2 text-3xl font-black">
              {programme.counts.partner}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InviteLinkCard({
  kind,
  initialCode,
  waived,
  baseUrl,
  locale,
}: {
  kind: InviteLinkKind;
  initialCode: string;
  waived: boolean;
  baseUrl: string;
  locale: string;
}) {
  const t = useTranslations("invite");
  const [code, setCode] = useState(initialCode);
  const [pending, startTransition] = useTransition();

  const url = `${baseUrl}/${locale}/r/${code}`;

  function rotate() {
    if (!window.confirm(t("rotateConfirm"))) return;

    startTransition(async () => {
      try {
        const result = await rotateMyInviteLinkAction(kind);
        if (!result.success || !result.code) throw new Error("rotate");
        setCode(result.code);
        toast.success(t("rotated"));
      } catch {
        toast.error(t("failed"));
      }
    });
  }

  return (
    <Card className="border-border bg-background shadow-none">
      <CardHeader>
        <CardTitle className="text-xl font-black uppercase tracking-[-0.01em]">
          {kind === "member" ? t("memberTitle") : t("partnerTitle")}
        </CardTitle>
        <CardDescription>
          {kind === "member" ? t("memberPurpose") : t("partnerPurpose")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <code className="block break-all border border-border bg-muted/40 p-3 text-sm">
          {url}
        </code>
        <p
          className={
            waived
              ? "text-sm font-bold text-accent-ink"
              : "text-sm text-muted-foreground"
          }
        >
          {waived
            ? kind === "member"
              ? t("memberFree")
              : t("partnerFree")
            : t("memberPaid")}
        </p>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={() => {
            void navigator.clipboard
              .writeText(url)
              .then(() => toast.success(t("copied")))
              .catch(() => toast.error(t("failed")));
          }}
        >
          {t("copy")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={rotate}
          disabled={pending}
        >
          {t("rotate")}
        </Button>
      </CardFooter>
    </Card>
  );
}
