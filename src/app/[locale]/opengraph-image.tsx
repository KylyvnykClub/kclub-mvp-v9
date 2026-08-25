import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Default 1200x630 social share card, generated rather than shipped as a static
 * asset so it stays in sync with the brand without a design round-trip. Applies
 * to every page under this locale segment; the partner pages override it with
 * their own logo when they have one. Text is Latin-only (the wordmark is Latin
 * regardless of locale), so the built-in font needs no Cyrillic face.
 */

export const runtime = "nodejs";
export const alt = "KYLYVNYK CLUB — a closed international business club";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GOLD = "#d4af37";
const GROUND = "#0a0a0a";
const INK = "#f4efe3";

const crownDataUri = `data:image/png;base64,${readFileSync(
  join(process.cwd(), "public/brand/logo/crown-gold-logo.png"),
).toString("base64")}`;

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: GROUND,
        position: "relative",
      }}
    >
      {/* Inset frame */}
      <div
        style={{
          position: "absolute",
          top: 44,
          left: 44,
          right: 44,
          bottom: 44,
          border: `1px solid rgba(212,175,55,0.32)`,
        }}
      />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={crownDataUri} width={268} height={188} alt="" />

      <div
        style={{
          display: "flex",
          marginTop: 40,
          fontSize: 82,
          fontWeight: 700,
          letterSpacing: 6,
          color: INK,
        }}
      >
        KYLYVNYK CLUB
      </div>

      <div
        style={{
          width: 120,
          height: 2,
          marginTop: 30,
          background: GOLD,
        }}
      />

      <div
        style={{
          display: "flex",
          marginTop: 30,
          fontSize: 27,
          letterSpacing: 9,
          color: GOLD,
        }}
      >
        A CLOSED INTERNATIONAL BUSINESS CLUB
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 70,
          display: "flex",
          fontSize: 24,
          letterSpacing: 3,
          color: "rgba(244,239,227,0.5)",
        }}
      >
        kylyvnyk.club
      </div>
    </div>,
    { ...size },
  );
}
