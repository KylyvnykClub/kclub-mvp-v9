import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentMember } from "@/actions/session";
import {
  ACCESS_GRANTING_SUBSCRIPTION_STATUSES,
  listSubscriptionsByCompanyId,
} from "@/data/billing";
import { findImageWithCompany } from "@/data/company-images";
import { db } from "@/data/db";
import {
  COMPANY_IMAGE_CONTENT_TYPE,
  getCompanyImage,
} from "@/modules/platform/company-image-storage";

/**
 * GET /api/company-image/[imageId] — one gallery photo (ADR 0022).
 *
 * Authenticated only, like the catalogue itself. The owner always sees their
 * own gallery (they need to manage it before approval); everyone else sees an
 * image only when its company is publishable — approved AND holding an
 * access-granting subscription, the same two read-time gates as FR-044.
 * Not-found and not-allowed are the same 404, so the route is not an oracle
 * for which image ids exist.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ imageId: string }> },
): Promise<NextResponse> {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    return new NextResponse(null, { status: 401 });
  }

  const { imageId } = await params;
  if (!z.string().uuid().safeParse(imageId).success) {
    return new NextResponse(null, { status: 404 });
  }

  const image = await findImageWithCompany(db, imageId);
  if (!image) {
    return new NextResponse(null, { status: 404 });
  }

  const isOwner = image.ownerId === auth.member.id;
  if (!isOwner) {
    if (image.moderationStatus !== "approved") {
      return new NextResponse(null, { status: 404 });
    }
    const subscriptions = await listSubscriptionsByCompanyId(
      db,
      image.companyId,
    );
    const publishable = subscriptions.some((s) =>
      ACCESS_GRANTING_SUBSCRIPTION_STATUSES.includes(s.status),
    );
    if (!publishable) {
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
