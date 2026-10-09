"use client";

import { QRCodeSVG } from "qrcode.react";

/**
 * FR-021/FR-022: the card's QR. Drawn at a fixed resolution and stretched to
 * its tile, so it stays as large as the card allows on any screen width.
 */
export function CardQr({ token, locale }: { token: string; locale: string }) {
  const url = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/${locale}/card/${token}`;

  return (
    <QRCodeSVG
      value={url}
      size={160}
      bgColor="transparent"
      fgColor="#14110b"
      level="L"
      marginSize={0}
      style={{ display: "block", width: "100%", height: "auto" }}
    />
  );
}
