"use client";

import Image from "next/image";
import { ArrowRight, Search } from "lucide-react";

import { KylReveal } from "./kyl-reveal";
import { blockPresentation, flagSrc } from "./partner-presentation";

import { FilledImage } from "@/components/media/filled-image";
import { Link } from "@/i18n/navigation";
import type { LandingPartner } from "@/lib/landing-partner";

/**
 * One catalogue card, in the design's directory grid.
 *
 * Shared by the server's first render and the client's filtered one, so a card
 * cannot change shape when the reader starts typing.
 *
 * The discount is printed rather than hidden behind a padlock. The reference
 * design locked it and asked the visitor to register first; the catalogue has
 * since been opened to signed-out visitors (FR-030), so the padlock would be
 * theatre over something readable one click away.
 *
 * The description is not printed: long ones turned the grid into a wall of
 * text, so the card ends in a "Details" button and the text lives on the
 * company page the whole card already links to.
 */
export function KylPartnerCard({
  partner,
  benefitLabel,
  privilegesLabel,
  detailsLabel,
}: {
  partner: LandingPartner;
  benefitLabel: string;
  /** FR-117: shown when the partner offers special privileges. */
  privilegesLabel: string;
  detailsLabel: string;
}) {
  const { art, Icon } = blockPresentation(partner.blockKey);
  const flag = flagSrc(partner.countryCode);
  const place = [partner.city, partner.countryCode?.toUpperCase()]
    .filter(Boolean)
    .join(" · ");

  return (
    <KylReveal as="article" className="partner-card">
      <Link className="partner-card-link" href={`/directory/${partner.slug}`}>
        <div className={`partner-art ${art}`}>
          {partner.logoUrl ? (
            <FilledImage
              className="partner-logo"
              src={partner.logoUrl}
              alt=""
              loading="lazy"
            />
          ) : (
            <Icon aria-hidden="true" />
          )}
          {place && (
            <span>
              {flag && (
                <Image
                  className="partner-place-flag"
                  src={flag}
                  alt=""
                  width={18}
                  height={12}
                />
              )}
              {place}
            </span>
          )}
        </div>
        <div className="partner-body">
          {partner.category && <p className="card-meta">{partner.category}</p>}
          <h3>{partner.name}</h3>
          {(partner.discount || partner.specialPrivileges) && (
            <div className="partner-benefit">
              <span>{benefitLabel}</span>
              {partner.discount && <strong>{partner.discount}</strong>}
              {partner.specialPrivileges && (
                <strong className="partner-privileges">
                  {privilegesLabel}
                </strong>
              )}
            </div>
          )}
          {/* A span, not a button: the whole card is already the link. */}
          <span className="partner-more">
            {detailsLabel}
            <ArrowRight aria-hidden="true" />
          </span>
        </div>
      </Link>
    </KylReveal>
  );
}

export function KylEmptyState({
  title,
  text,
  action,
  onReset,
}: {
  title: string;
  text: string;
  action: string;
  onReset: () => void;
}) {
  return (
    <div className="empty-state">
      <Search aria-hidden="true" />
      <h3>{title}</h3>
      <p>{text}</p>
      <button
        className="button button-secondary"
        type="button"
        onClick={onReset}
      >
        {action}
      </button>
    </div>
  );
}
