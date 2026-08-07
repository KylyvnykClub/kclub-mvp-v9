export const CONSENT_DOCUMENT_IDS = [
  "terms-of-use",
  "privacy-policy",
  "arbitration",
  "age-verification",
] as const;

export type ConsentDocumentId = (typeof CONSENT_DOCUMENT_IDS)[number];

export interface ConsentAcceptance {
  documentId: ConsentDocumentId;
  version: string;
}

/**
 * The age attestation has no published document; this is the version of the
 * attestation wording shown at registration (FR-097 records its version
 * alongside the arbitration acknowledgement).
 */
export const AGE_ATTESTATION_VERSION = "1.0";

/**
 * The arbitration agreement lives in the Terms of Use (§29–30), so the
 * acknowledgement version tracks the Terms version.
 */
export function consentSourceDocument(documentId: ConsentDocumentId): string {
  if (documentId === "arbitration") {
    return "terms-of-use";
  }
  return documentId;
}
