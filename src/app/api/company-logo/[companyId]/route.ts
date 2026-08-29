import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentMember } from "@/actions/session";
import {
  ACCESS_GRANTING_SUBSCRIPTION_STATUSES,
  listSubscriptionsByCompanyId,
} from "@/data/billing";
import { findCompanyById } from "@/data/companies";
import { db } from "@/data/db";
import {
  COMPANY_IMAGE_CONTENT_TYPE,
  getCompanyLogo,
} from "@/modules/platform/company-image-storage";

/**
 * GET /api/company-logo/[companyId] — a company's logo (ADR 0023).
 *
 * Unlike the gallery, a logo is public brand imagery: the marketing landing's
 * showcase and the page's OpenGraph card both render it to anonymous
 * visitors. So there is no session requirement — visibility is the
 * publishable test alone (approved AND an access-granting subscription,
 * FR-044), with the owner allowed through when a session says it is them, so
 * they can see the logo they just uploaded before approval. Missing and
 * not-visible are the same 404.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ companyId: string }> },
): Promise<NextResponse> {
  const { companyId } = await params;
  if (!z.string().uuid().safeParse(companyId).success) {
    return new NextResponse(null, { status: 404 });
  }

  const company = await findCompanyById(db, companyId);
  if (!company || !company.logoUrl) {
    return new NextResponse(null, { status: 404 });
  }

  const auth = await getCurrentMember();
  const isOwner = auth?.member?.id === company.ownerId;

  if (!isOwner) {
    if (company.moderationStatus !== "approved") {
      return new NextResponse(null, { status: 404 });
    }
    const subscriptions = await listSubscriptionsByCompanyId(db, companyId);
    const publishable = subscriptions.some((s) =>
      ACCESS_GRANTING_SUBSCRIPTION_STATUSES.includes(s.status),
    );
    if (!publishable) {
      return new NextResponse(null, { status: 404 });
    }
  }

  const bytes = await getCompanyLogo(companyId);
  if (!bytes) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": COMPANY_IMAGE_CONTENT_TYPE,
      // Public content once publishable, but the owner path depends on the
      // caller — so no shared cache. no-cache because the slot is overwritten
      // in place; readers version the URL with the company's updatedAt.
      "Cache-Control": "private, no-cache",
    },
  });
}
