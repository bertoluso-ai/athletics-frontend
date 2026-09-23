import { NextRequest, NextResponse } from "next/server";
import { getUpcomingCompetitions } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") || undefined;
  const rows = await getUpcomingCompetitions(10, category);
  return NextResponse.json(rows);
}
