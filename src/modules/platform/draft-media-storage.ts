import {
  companyImageObjectKey,
  companyLogoObjectKey,
} from "@/lib/company-image-path";
import {
  draftImageObjectKey,
  draftLogoObjectKey,
  draftMediaPrefix,
} from "@/lib/draft-media-path";
import { COMPANY_IMAGE_CONTENT_TYPE } from "./company-image-storage";
import { getObjectStorage } from "./r2-client";

/**
 * Staging for media uploaded before the company exists (ADR 0024). Objects
 * live under `media/drafts/{memberId}/` until submission promotes them to
 * the company's keys, or discard / the 90-day draft sweep deletes the prefix.
 */

export async function putDraftLogo(
  memberId: string,
  webpBytes: Buffer,
): Promise<void> {
  await getObjectStorage().putObject(
    draftLogoObjectKey(memberId),
    webpBytes,
    COMPANY_IMAGE_CONTENT_TYPE,
  );
}

export async function putDraftImage(
  memberId: string,
  imageId: string,
  webpBytes: Buffer,
): Promise<void> {
  await getObjectStorage().putObject(
    draftImageObjectKey(memberId, imageId),
    webpBytes,
    COMPANY_IMAGE_CONTENT_TYPE,
  );
}

export async function getDraftObject(key: string): Promise<Buffer | null> {
  return getObjectStorage().getObject(key);
}

export async function deleteDraftObject(key: string): Promise<void> {
  await getObjectStorage().deleteObject(key);
}

/** Everything staged for one applicant, whatever the draft row remembers. */
export async function deleteDraftMedia(memberId: string): Promise<void> {
  const storage = getObjectStorage();
  const keys = await storage.listKeys(draftMediaPrefix(memberId));
  for (const key of keys) {
    await storage.deleteObject(key);
  }
}

/**
 * Copy staged objects to the new company's keys. Returns which of the
 * requested images were actually present in staging, so the caller inserts
 * rows only for objects that exist. The staging prefix is left for the
 * caller to delete once the rows are written - a copy that half-succeeded
 * must not lose its source.
 */
export async function promoteDraftMedia(
  memberId: string,
  companyId: string,
  options: { logo: boolean; imageIds: string[] },
): Promise<{ logo: boolean; imageIds: string[] }> {
  const storage = getObjectStorage();
  const staged = new Set(await storage.listKeys(draftMediaPrefix(memberId)));

  let logo = false;
  if (options.logo && staged.has(draftLogoObjectKey(memberId))) {
    await storage.copyObject(
      draftLogoObjectKey(memberId),
      companyLogoObjectKey(companyId),
    );
    logo = true;
  }

  const imageIds: string[] = [];
  for (const imageId of options.imageIds) {
    const from = draftImageObjectKey(memberId, imageId);
    if (!staged.has(from)) continue;
    await storage.copyObject(from, companyImageObjectKey(companyId, imageId));
    imageIds.push(imageId);
  }

  return { logo, imageIds };
}
