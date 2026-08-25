import type { Metadata } from "next";
import { getCardByPublicToken } from "@/actions/session";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { CheckCircle, XCircle, ShieldQuestion } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

/**
 * A card URL carries a member's public QR token and must never be indexed,
 * even though it is unauthenticated. This hard noindex overrides the root
 * layout's launch-gated default, so the switch that opens the marketing pages
 * to search never reaches the card. Pairs with the robots.txt card disallow.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default async function CardVerificationPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("card");

  const card = await getCardByPublicToken(token);

  if (!card) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Card className="w-full max-w-md text-center border-muted bg-background/60 backdrop-blur-md animate-in fade-in zoom-in-95 duration-500">
          <CardHeader>
            <div className="mx-auto bg-muted p-3 rounded-full mb-4">
              <ShieldQuestion className="h-10 w-10 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl font-serif">
              {t("invalidTitle")}
            </CardTitle>
            <CardDescription>{t("invalidSubtitle")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (card.status === "revoked") {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Card className="w-full max-w-md text-center border-destructive/30 bg-destructive/5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-500 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-destructive/60 to-destructive" />
          <CardHeader>
            <div className="mx-auto bg-destructive/10 p-3 rounded-full mb-4">
              <XCircle className="h-10 w-10 text-destructive" />
            </div>
            <CardTitle className="text-2xl font-serif text-destructive">
              {t("revokedTitle")}
            </CardTitle>
            <CardDescription className="text-destructive/80">
              {t("revokedSubtitle")}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const isVip = card.tier === "vip";
  const tierText = isVip ? t("tierVip") : t("tierFree");

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md border-emerald-500/20 bg-emerald-500/5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-500 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-emerald-600" />
        <CardHeader className="text-center pb-6">
          <div className="mx-auto bg-emerald-500/10 p-3 rounded-full mb-4">
            <CheckCircle className="h-10 w-10 text-emerald-500" />
          </div>
          <CardTitle className="text-2xl font-serif text-foreground">
            {t("verifiedTitle")}
          </CardTitle>
          <CardDescription className="text-emerald-500/80 font-medium">
            {t("verifiedSubtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-border/50">
              <span className="text-sm text-muted-foreground">
                {t("memberName")}
              </span>
              <span className="font-medium text-foreground">
                {card.memberName}
              </span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-border/50">
              <span className="text-sm text-muted-foreground">
                {t("serial")}
              </span>
              <span className="font-mono text-sm tracking-wider">
                {card.serial}
              </span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-border/50">
              <span className="text-sm text-muted-foreground">{t("tier")}</span>
              <span
                className={`font-medium ${isVip ? "text-[oklch(0.78_0.14_85)]" : "text-foreground"}`}
              >
                {tierText}
              </span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-border/50">
              <span className="text-sm text-muted-foreground">
                {t("issuedAt")}
              </span>
              <span className="font-medium">
                {new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
                  new Date(card.issuedAt),
                )}
              </span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-sm text-muted-foreground">
                {t("status")}
              </span>
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-500 border border-emerald-500/20">
                {t("statusValid")}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
