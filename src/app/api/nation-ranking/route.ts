import { NextRequest, NextResponse } from "next/server";
import { getNationRanking } from "@/lib/countries";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const event = searchParams.get("event") || undefined;
  const gender = searchParams.get("gender") === "Women" ? "Women" : "Men";
  const year = Number(searchParams.get("year")) || new Date().getFullYear();
  const view = searchParams.get("view") === "wins" ? "wins" : "season";

  const rows = await getNationRanking({ view, gender, year, event });
  return NextResponse.json(rows.slice(0, 10));
}
