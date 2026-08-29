import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentMember } from "@/actions/session";
import { findCompanyDraftByOwner } from "@/data/company-drafts";
import { db } from "@/data/db";
import { companyDraftDataSchema } from "@/lib/company-form";
import {
  DRAFT_LOGO_SLOT,
  draftImageObjectKey,
  draftLogoObjectKey,
  parseDraftImageIds,
} from "@/lib/draft-media-path";
import { COMPANY_IMAGE_CONTENT_TYPE } from "@/modules/platform/company-image-storage";
import { getDraftObject } from "@/modules/platform/draft-media-storage";

/**
 * GET /api/draft-media/[slot] — preview of media staged during onboarding
 * (ADR 0024). `slot` is `logo` or a staged image id.
 *
 * Always the caller's own staging: the object key is derived from the
 * session's member id, and the image id must be one the caller's draft row
 * lists. There is no request shape that reaches another applicant's staging.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slot: string }> },
): Promise<NextResponse> {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    return new NextResponse(null, { status: 401 });
  }

  const { slot } = await params;
  const memberId = auth.member.id;

  let key: string;
  if (slot === DRAFT_LOGO_SLOT) {
    key = draftLogoObjectKey(memberId);
  } else {
    if (!z.string().uuid().safeParse(slot).success) {
      return new NextResponse(null, { status: 404 });
    }
    const draft = await findCompanyDraftByOwner(db, memberId);
    const data = draft
      ? (companyDraftDataSchema.safeParse(draft.data).data ?? {})
      : {};
    if (!parseDraftImageIds(data.galleryImageIds).includes(slot)) {
      return new NextResponse(null, { status: 404 });
    }
    key = draftImageObjectKey(memberId, slot);
  }

  const bytes = await getDraftObject(key);
  if (!bytes) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": COMPANY_IMAGE_CONTENT_TYPE,
      "Cache-Control": "private, no-cache",
    },
  });
}
