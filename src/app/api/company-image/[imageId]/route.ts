import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentMember } from "@/actions/session";
import { companyListingIsPaid } from "@/data/companies";
import { findImageWithCompany } from "@/data/company-images";
import { db } from "@/data/db";
import {
  COMPANY_IMAGE_CONTENT_TYPE,
  getCompanyImage,
} from "@/modules/platform/company-image-storage";

/**
 * GET /api/company-image/[imageId] — one gallery photo (ADR 0022).
 *
 * The owner always sees their own gallery (they need to manage it before
 * approval); everyone else - signed in or not - sees an image only when its
 * company is publishable: approved AND a paid listing, the same two read-time
 * gates as FR-044. Not-found and not-allowed are the same 404, so the route is
 * not an oracle for which image ids exist.
 *
 * Open to guests since ADR 0037. A partner's page is their advertising: the
 * QR code on their counter sends people who have never heard of the club to
 * it, and a page whose cover and photos answer 401 to exactly those people is
 * a broken page. The photos are the partner's own marketing material, chosen
 * to be shown; contact details stay behind sign-in (ADR 0034).
 */
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ imageId: string }> },
): Promise<NextResponse> {
  const { imageId } = await params;
  if (!z.string().uuid().safeParse(imageId).success) {
    return new NextResponse(null, { status: 404 });
  }

  const image = await findImageWithCompany(db, imageId);
  if (!image) {
    return new NextResponse(null, { status: 404 });
  }

  const auth = await getCurrentMember();
  const isOwner = auth?.member?.id === image.ownerId;
  if (!isOwner) {
    if (image.moderationStatus !== "approved") {
      return new NextResponse(null, { status: 404 });
    }
    if (!(await companyListingIsPaid(db, image.companyId, new Date()))) {
      return new NextResponse(null, { status: 404 });
    }
  }

  const bytes = await getCompanyImage(image.companyId, imageId);
  if (!bytes) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": COMPANY_IMAGE_CONTENT_TYPE,
      // Private: visibility depends on who is asking (owner vs member vs
      // publishable), so no shared cache may hold the answer. Gallery
      // objects are immutable per id, so a browser may keep them a while.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
