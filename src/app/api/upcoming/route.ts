import { NextRequest, NextResponse } from "next/server";
import { getUpcomingCompetitions } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") || undefined;
  const discipline = searchParams.get("discipline") || undefined;
  const rows = await getUpcomingCompetitions(10, category, discipline);
  return NextResponse.json(rows);
}
