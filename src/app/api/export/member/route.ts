import { db } from "@/data/db";
import { getCurrentMember } from "@/actions/session";
import { getMemberExportData } from "@/data/members";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getCurrentMember();

  if (!session?.member) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const memberId = session.member.id;

  const exportData = await getMemberExportData(db, memberId);

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="member_data_${memberId}.json"`,
    },
  });
}
