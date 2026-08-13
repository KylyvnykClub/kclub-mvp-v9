import { NextResponse } from "next/server";
import { getCurrentMember } from "@/actions/session";
import { appendAuditEntry } from "@/data/audit-log";
import { db } from "@/data/db";
import { getMemberExportData } from "@/data/members";
import { buildActor, normalizeRole } from "@/domain/actor";
import { can } from "@/domain/authorization";

type Params = {
  params: Promise<{ memberId: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const session = await getCurrentMember();
  if (!session?.member) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const actor = buildActor(session.member);
  if (!can(actor, "export_data", "member")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { memberId } = await params;
  const exportData = await getMemberExportData(db, memberId);
  if (!exportData) {
    return new NextResponse("Not found", { status: 404 });
  }

  await appendAuditEntry(db, {
    actorType: normalizeRole(session.member.role),
    actorId: session.member.id,
    action: "export_member_data",
    subjectType: "member",
    subjectId: memberId,
    meta: {
      requestedBy: "staff_owner",
    },
  });

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="member_data_${memberId}.json"`,
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Cache-Control": "private, no-store",
    },
  });
}
