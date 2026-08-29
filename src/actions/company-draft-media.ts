"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { getCurrentMember } from "@/actions/session";
import {
  findCompanyDraftByOwner,
  upsertCompanyDraft,
} from "@/data/company-drafts";
import { db } from "@/data/db";
import { buildActor } from "@/domain/actor";
import { assertCan } from "@/domain/authorization";
import { COMPANY_GALLERY_MAX_IMAGES } from "@/lib/company-image-path";
import {
  companyDraftDataSchema,
  type CompanyDraftData,
} from "@/lib/company-form";
import {
  draftImageObjectKey,
  draftLogoObjectKey,
  parseDraftImageIds,
} from "@/lib/draft-media-path";
import {
  InvalidImageError,
  processGalleryImage,
  processLogoImage,
} from "@/lib/image-processing";
import {
  deleteDraftObject,
  putDraftImage,
  putDraftLogo,
} from "@/modules/platform/draft-media-storage";

/**
 * Media uploaded during onboarding, before the company exists (ADR 0024).
 *
 * Each action stages the bytes under the applicant's draft prefix and records
 * what is staged in the draft row's data, so a resumed draft still knows its
 * photos. Submission promotes them (src/actions/company.ts); discard and the
 * retention sweep delete the prefix.
 */

export type DraftMediaState = {
  success: boolean;
  error?: string;
  imageId?: string;
};

async function loadDraft(memberId: string): Promise<{
  step: number;
  data: CompanyDraftData;
}> {
  const existing = await findCompanyDraftByOwner(db, memberId);
  const data = existing
    ? (companyDraftDataSchema.safeParse(existing.data).data ?? {})
    : {};
  return { step: existing?.step ?? 1, data };
}

async function requireApplicant() {
  const auth = await getCurrentMember();
  if (!auth?.member) return null;
  const actor = buildActor(auth.member);
  assertCan(actor, "create", "own_company");
  return auth.member;
}

function imageErrorCode(err: unknown): string {
  return err instanceof InvalidImageError ? err.code : "processing_failed";
}

export async function uploadDraftLogoAction(
  formData: FormData,
): Promise<DraftMediaState> {
  try {
    const member = await requireApplicant();
    if (!member) return { success: false, error: "Unauthorized" };

    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) {
      return { success: false, error: "unreadable" };
    }

    let webp: Buffer;
    try {
      webp = await processLogoImage(Buffer.from(await file.arrayBuffer()));
    } catch (err) {
      return { success: false, error: imageErrorCode(err) };
    }

    await putDraftLogo(member.id, webp);
    const draft = await loadDraft(member.id);
    await upsertCompanyDraft(db, member.id, draft.step, {
      ...draft.data,
      logoStaged: "true",
    });

    return { success: true };
  } catch {
    return { success: false, error: "processing_failed" };
  }
}

export async function removeDraftLogoAction(): Promise<DraftMediaState> {
  try {
    const member = await requireApplicant();
    if (!member) return { success: false, error: "Unauthorized" };

    const draft = await loadDraft(member.id);
    await upsertCompanyDraft(db, member.id, draft.step, {
      ...draft.data,
      logoStaged: "",
    });
    try {
      await deleteDraftObject(draftLogoObjectKey(member.id));
    } catch (err) {
      console.error(
        `[draft-media] logo delete failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }

    return { success: true };
  } catch {
    return { success: false, error: "processing_failed" };
  }
}

export async function uploadDraftImageAction(
  formData: FormData,
): Promise<DraftMediaState> {
  try {
    const member = await requireApplicant();
    if (!member) return { success: false, error: "Unauthorized" };

    const draft = await loadDraft(member.id);
    const existing = parseDraftImageIds(draft.data.galleryImageIds);
    if (existing.length >= COMPANY_GALLERY_MAX_IMAGES) {
      return { success: false, error: "gallery_full" };
    }

    const file = formData.get("image");
    if (!(file instanceof File) || file.size === 0) {
      return { success: false, error: "unreadable" };
    }

    let webp: Buffer;
    try {
      webp = await processGalleryImage(Buffer.from(await file.arrayBuffer()));
    } catch (err) {
      return { success: false, error: imageErrorCode(err) };
    }

    const imageId = randomUUID();
    await putDraftImage(member.id, imageId, webp);
    await upsertCompanyDraft(db, member.id, draft.step, {
      ...draft.data,
      galleryImageIds: [...existing, imageId].join(","),
    });

    return { success: true, imageId };
  } catch {
    return { success: false, error: "processing_failed" };
  }
}

export async function deleteDraftImageAction(
  imageId: string,
): Promise<DraftMediaState> {
  try {
    const member = await requireApplicant();
    if (!member) return { success: false, error: "Unauthorized" };

    z.string().uuid().parse(imageId);
    const draft = await loadDraft(member.id);
    const existing = parseDraftImageIds(draft.data.galleryImageIds);
    if (!existing.includes(imageId)) {
      return { success: false, error: "Not found" };
    }

    await upsertCompanyDraft(db, member.id, draft.step, {
      ...draft.data,
      galleryImageIds: existing.filter((id) => id !== imageId).join(","),
    });
    try {
      await deleteDraftObject(draftImageObjectKey(member.id, imageId));
    } catch (err) {
      console.error(
        `[draft-media] image delete failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }

    return { success: true };
  } catch (err) {
    if (err instanceof z.ZodError)
      return { success: false, error: "Not found" };
    return { success: false, error: "processing_failed" };
  }
}
