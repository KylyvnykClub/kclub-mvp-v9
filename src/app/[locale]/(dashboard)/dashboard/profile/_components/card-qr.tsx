"use client";

import { QRCodeSVG } from "qrcode.react";

/**
 * The card's QR, for whatever address the card carries: the verification page
 * (FR-022) or, on a business partner's card, their company page. Drawn at a
 * fixed resolution and stretched to its tile, so it stays as large as the card
 * allows on any screen width.
 */
export function CardQr({ url }: { url: string }) {
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
