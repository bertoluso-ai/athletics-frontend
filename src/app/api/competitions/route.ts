import { NextRequest, NextResponse } from "next/server";
import { getCompetitionsList } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const gender = searchParams.get("gender") || undefined;
  const tier = searchParams.get("tier") || undefined;
  const yearParam = searchParams.get("year");
  const year = yearParam ? Number(yearParam) : undefined;
  const search = searchParams.get("search") || undefined;
  const disciplinesParam = searchParams.get("disciplines");
  const disciplines = disciplinesParam ? disciplinesParam.split(",") : undefined;

  const rows = await getCompetitionsList({ gender, tier, year, disciplines, search });
  return NextResponse.json({ rows });
}
