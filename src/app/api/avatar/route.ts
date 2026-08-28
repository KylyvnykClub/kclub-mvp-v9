import { NextResponse } from "next/server";
import { getCurrentMember } from "@/actions/session";
import {
  AVATAR_CONTENT_TYPE,
  getAvatar,
} from "@/modules/platform/avatar-storage";

/**
 * GET /api/avatar — always the caller's own avatar, never anyone else's.
 *
 * Deliberately not `/api/avatar/[memberId]`: nothing in the product shows one
 * member's avatar to another today (ADR 0005 - no member directory), so this
 * route does not accept a target id at all rather than adding an
 * object-level authorization check for a case that cannot currently happen.
 * A future feature that needs to show avatars to other members is a new
 * decision, not an extension of this route's contract.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    return new NextResponse(null, { status: 401 });
  }

  const bytes = await getAvatar(auth.member.id);
  if (!bytes) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": AVATAR_CONTENT_TYPE,
      // Private: this URL is identical for every member, so a shared cache
      // must never serve one member's photo to another's request.
      "Cache-Control": "private, max-age=60",
    },
  });
}
