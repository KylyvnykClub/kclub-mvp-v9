"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { QRCodeCanvas } from "qrcode.react";
import { Check, Copy, Download, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";

const LOCALES = ["en", "ru", "uk"] as const;
type PageLocale = (typeof LOCALES)[number];

/**
 * The QR code for a partner's own page (FR-118).
 *
 * It points at `/{locale}/directory/{slug}` - the one-page landing every
 * published partner has - so a code printed on a counter, a menu or a business
 * card sends whoever scans it straight to the partner. The slug is fixed when
 * the company is created and never rewritten, so a printed code keeps working
 * after the partner edits their name.
 *
 * Rendered to a canvas at print resolution and shown small, so the download is
 * sharp enough for a poster while the panel stays compact. The language is the
 * page the code opens in; the reader can still switch it there.
 */
export function PartnerQr({
  appUrl,
  slug,
  companyName,
  defaultLocale,
}: {
  appUrl: string;
  slug: string;
  companyName: string;
  defaultLocale: string;
}) {
  const t = useTranslations("partnerQr");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [locale, setLocale] = useState<PageLocale>(
    LOCALES.includes(defaultLocale as PageLocale)
      ? (defaultLocale as PageLocale)
      : "en",
  );
  const [copied, setCopied] = useState(false);

  const url = `${appUrl.replace(/\/$/, "")}/${locale}/directory/${slug}`;

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `kclub-${slug}-${locale}-qr.png`;
    link.click();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="mt-6 border-t border-border/50 pt-6">
      <p className="text-sm font-medium">{t("title")}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {t("note")}
      </p>

      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="shrink-0 self-start bg-white p-3">
          <QRCodeCanvas
            ref={canvasRef}
            value={url}
            size={1024}
            level="M"
            marginSize={2}
            bgColor="#ffffff"
            fgColor="#000000"
            title={t("alt", { name: companyName })}
            style={{ width: 176, height: 176 }}
          />
        </div>

        <div className="min-w-0 space-y-3">
          <div
            role="radiogroup"
            aria-label={t("languageLabel")}
            className="flex gap-1"
          >
            {LOCALES.map((code) => (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={locale === code}
                onClick={() => setLocale(code)}
                className={`h-8 min-w-10 border px-2 text-xs font-bold uppercase tracking-[0.1em] ${
                  locale === code
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-input text-muted-foreground hover:text-foreground"
                }`}
              >
                {code}
              </button>
            ))}
          </div>

          <p className="break-all font-mono text-xs text-muted-foreground">
            {url}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={download}>
              <Download className="size-4" aria-hidden="true" />
              {t("download")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void copy()}
            >
              {copied ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
              {copied ? t("copied") : t("copy")}
            </Button>
            <Button asChild size="sm" variant="ghost">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" aria-hidden="true" />
                {t("open")}
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
