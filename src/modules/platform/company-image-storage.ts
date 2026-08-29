import {
  companyImageObjectKey,
  companyLogoObjectKey,
} from "@/lib/company-image-path";
import { getObjectStorage } from "./r2-client";

export const COMPANY_IMAGE_CONTENT_TYPE = "image/webp";

/**
 * Unlike the avatar's one-slot-per-member key, a gallery object is keyed by
 * its row id — so deleting the row and deleting the object share one
 * identifier, and the erasure job can enumerate rows to find every object
 * it owes a DELETE (ADR 0022).
 */
export async function putCompanyImage(
  companyId: string,
  imageId: string,
  webpBytes: Buffer,
): Promise<void> {
  await getObjectStorage().putObject(
    companyImageObjectKey(companyId, imageId),
    webpBytes,
    COMPANY_IMAGE_CONTENT_TYPE,
  );
}

export async function getCompanyImage(
  companyId: string,
  imageId: string,
): Promise<Buffer | null> {
  return getObjectStorage().getObject(
    companyImageObjectKey(companyId, imageId),
  );
}

export async function deleteCompanyImage(
  companyId: string,
  imageId: string,
): Promise<void> {
  await getObjectStorage().deleteObject(
    companyImageObjectKey(companyId, imageId),
  );
}

/** One logo slot per company, overwritten on upload (ADR 0023). */
export async function putCompanyLogo(
  companyId: string,
  webpBytes: Buffer,
): Promise<void> {
  await getObjectStorage().putObject(
    companyLogoObjectKey(companyId),
    webpBytes,
    COMPANY_IMAGE_CONTENT_TYPE,
  );
}

export async function getCompanyLogo(
  companyId: string,
): Promise<Buffer | null> {
  return getObjectStorage().getObject(companyLogoObjectKey(companyId));
}

export async function deleteCompanyLogo(companyId: string): Promise<void> {
  await getObjectStorage().deleteObject(companyLogoObjectKey(companyId));
}
