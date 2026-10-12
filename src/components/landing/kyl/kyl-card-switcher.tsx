"use client";

import { useState } from "react";

import { MembershipCard } from "@/components/card/membership-card";
import type { CardFace } from "@/domain/card-face";

/**
 * The three club cards side by side in one place (FR-021): a visitor picks
 * member, VIP or business partner and sees the card that membership carries,
 * in its own metal. The cards are the real component with sample contents, so
 * the landing can never show a card the product does not issue.
 *
 * The only client code on the section, and only for the tab state.
 */
export interface CardSample {
  face: CardFace;
  tab: string;
  holder: string;
  membershipLabel: string;
  company: { name: string; discount: string } | null;
}

export function KylCardSwitcher({
  samples,
  qrUrl,
  labels,
  tabsLabel,
}: {
  samples: CardSample[];
  qrUrl: string;
  labels: {
    holder: string;
    membership: string;
    serial: string;
    status: string;
    company: string;
    discount: string;
  };
  tabsLabel: string;
}) {
  const [active, setActive] = useState<CardFace>(samples[0]?.face ?? "member");
  const sample = samples.find((s) => s.face === active) ?? samples[0];

  return (
    <div className="kyl-card-switch">
      <div className="kyl-card-tabs" role="tablist" aria-label={tabsLabel}>
        {samples.map((s) => (
          <button
            key={s.face}
            type="button"
            role="tab"
            id={`card-tab-${s.face}`}
            aria-selected={s.face === active}
            aria-controls="card-tab-panel"
            className="kyl-card-tab"
            data-active={s.face === active || undefined}
            onClick={() => setActive(s.face)}
          >
            {s.tab}
          </button>
        ))}
      </div>
      {sample && (
        <div
          id="card-tab-panel"
          role="tabpanel"
          aria-labelledby={`card-tab-${sample.face}`}
          className="kyl-card-stage"
        >
          <MembershipCard
            face={sample.face}
            holder={sample.holder}
            membershipLabel={sample.membershipLabel}
            serial="UA-10001"
            company={
              sample.company ? { ...sample.company, logoSrc: null } : null
            }
            qrUrl={qrUrl}
            valid
            labels={labels}
          />
        </div>
      )}
    </div>
  );
}
