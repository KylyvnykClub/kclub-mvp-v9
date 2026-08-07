"use client";

import { QRCodeSVG } from "qrcode.react";

export function CardQr({ token, locale }: { token: string; locale: string }) {
  const url = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/${locale}/card/${token}`;

  return (
    <div className="bg-white p-1 rounded-sm shadow-sm inline-block">
      <QRCodeSVG
        value={url}
        size={80}
        bgColor={"#ffffff"}
        fgColor={"#000000"}
        level={"L"}
        includeMargin={false}
      />
    </div>
  );
}
