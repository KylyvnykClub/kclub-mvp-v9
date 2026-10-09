import type { CSSProperties } from "react";

import { CardQr } from "./card-qr";
import type { CardFace } from "@/domain/card-face";

/**
 * The club card as the member sees it (FR-021), after the owner's reference:
 * brushed metal, a crown, the club's name in the display serif, the holder,
 * the membership and the serial, with the QR on a light tile. The serial sits
 * top right, clear of the QR, so a long membership name never runs into it.
 *
 * The three faces - member, VIP member, business partner - share the gold
 * of the reference and differ only in the membership printed on them.
 *
 * Sized in container units, so the text keeps its proportion from a phone to
 * the desktop column. Text and QR have floors for legibility at arm's length
 * (FR-021), and a card narrower than a phone screen grows a little taller to
 * keep them apart.
 */

interface Metal {
  base: string;
  /** The gradient painted into the wordmark and the crown. */
  ink: string;
  frame: string;
  label: string;
  value: string;
  tile: string;
}

/** The reference's brushed gold. Every face wears it (the owner's call). */
const GOLD: Metal = {
  base: "linear-gradient(115deg, #2a2013 0%, #5c4727 20%, #2b2013 38%, #74592f 56%, #2e2314 74%, #4d3b21 100%)",
  ink: "linear-gradient(180deg, #f6e2a4 0%, #d4b064 50%, #a07c3b 100%)",
  frame: "rgba(232, 200, 130, 0.32)",
  label: "rgba(232, 208, 156, 0.72)",
  value: "#f6eddb",
  tile: "#f4ecd6",
};

/** Brushed grain, the lathe rings and one diagonal sheen, over any metal. */
const FINISH = [
  "linear-gradient(115deg, transparent 28%, rgba(255,255,255,0.13) 44%, transparent 60%)",
  "repeating-radial-gradient(circle at 72% 38%, rgba(255,255,255,0.035) 0 1px, transparent 1px 12px)",
  "repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 3px)",
].join(", ");

export interface MembershipCardProps {
  face: CardFace;
  holder: string;
  membershipLabel: string;
  serial: string;
  /** What the QR opens; null draws no QR. */
  qrUrl: string | null;
  valid: boolean;
  labels: {
    holder: string;
    membership: string;
    serial: string;
    status: string;
  };
}

export function MembershipCard({
  face,
  holder,
  membershipLabel,
  serial,
  qrUrl,
  valid,
  labels,
}: MembershipCardProps) {
  const metal = GOLD;
  const inked: CSSProperties = {
    backgroundImage: metal.ink,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  };

  return (
    <div className="@container w-full max-w-[460px]">
      <div
        data-card-face={face}
        className="relative aspect-[85.6/53.98] w-full overflow-hidden @max-[24rem]:aspect-[85.6/62] rounded-[5cqw] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)]"
        style={{
          backgroundImage: `${FINISH}, ${metal.base}`,
        }}
      >
        {/* The inner hairline frame. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-[3.2cqw] rounded-[2.6cqw] border"
          style={{ borderColor: metal.frame }}
        />

        <div className="absolute inset-0 flex flex-col p-[7cqw]">
          <div className="flex items-start justify-between">
            <Crown ink={metal.ink} face={face} />
            <div className="text-right">
              <p className="sr-only">{labels.serial}</p>
              <p
                className="font-mono text-[max(11px,3.2cqw)] leading-tight tracking-[0.1em] whitespace-nowrap"
                style={{ color: metal.label }}
              >
                {serial}
              </p>
              {/* Only a revoked card says so: the reference card carries no
                  status, and a valid one needs none. */}
              {!valid && (
                <p className="mt-[0.8cqw] flex items-center justify-end gap-[1.4cqw] text-[max(9px,2.4cqw)] font-semibold tracking-[0.14em] text-red-300 uppercase">
                  <span className="size-[1.8cqw] rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]" />
                  {labels.status}
                </p>
              )}
            </div>
          </div>

          <p
            className="mt-[3.4cqw] font-display text-[8cqw] leading-none font-normal tracking-[0.08em] whitespace-nowrap"
            style={inked}
          >
            KYLYVNYK CLUB
          </p>
          <div
            aria-hidden="true"
            className="mt-[3cqw] h-px w-[16cqw]"
            style={{ backgroundImage: metal.ink }}
          />

          <div className="mt-auto max-w-[58cqw] min-w-0">
            <p
              className="text-[max(10px,2.5cqw)] tracking-[0.06em]"
              style={{ color: metal.label }}
            >
              {labels.holder}
            </p>
            <p
              className="mt-[0.6cqw] truncate text-[4.6cqw] leading-tight font-medium"
              style={{ color: metal.value }}
            >
              {holder}
            </p>

            <p
              className="mt-[3.2cqw] text-[max(10px,2.5cqw)] tracking-[0.06em]"
              style={{ color: metal.label }}
            >
              {labels.membership}
            </p>
            <p
              className="mt-[0.6cqw] truncate font-display text-[4.4cqw] leading-tight"
              style={inked}
            >
              {membershipLabel}
            </p>
          </div>
        </div>

        {qrUrl && (
          <div
            className="absolute right-[7cqw] bottom-[4.6cqw] w-[28cqw] rounded-[3cqw] border p-[2.8cqw] shadow-[0_12px_28px_-8px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.7),inset_0_-2px_4px_rgba(0,0,0,0.12)]"
            style={{
              // A cream tile with a metal rim, as in the reference.
              backgroundImage: `linear-gradient(160deg, #ffffff40, transparent 45%), linear-gradient(${metal.tile}, ${metal.tile})`,
              borderColor: metal.frame,
            }}
          >
            <CardQr url={qrUrl} />
          </div>
        )}
      </div>
    </div>
  );
}

function Crown({ ink, face }: { ink: string; face: CardFace }) {
  const id = `crown-${face}`;
  // The crown's fill is the face's ink, read back out of its CSS gradient.
  const stops = ink.match(/#[0-9a-f]{6}/gi) ?? ["#d4b064"];

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 44"
      className="h-auto w-[11cqw] drop-shadow-[0_2px_3px_rgba(0,0,0,0.45)]"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {stops.map((color, index) => (
            <stop
              key={color}
              offset={stops.length === 1 ? 0 : index / (stops.length - 1)}
              stopColor={color}
            />
          ))}
        </linearGradient>
      </defs>
      <g fill={`url(#${id})`}>
        <path d="M6 33 3 12l15 10 14-18 14 18 15-10-3 21Z" />
        <circle cx="3" cy="9" r="3" />
        <circle cx="32" cy="4" r="3.4" />
        <circle cx="61" cy="9" r="3" />
        <path d="M7 37c16-3 34-3 50 0l-.8 4C40 38.5 24 38.5 7.8 41Z" />
      </g>
      <path d="M32 18.5 35 24l-3 5.5-3-5.5Z" fill="rgba(0,0,0,0.55)" />
    </svg>
  );
}
