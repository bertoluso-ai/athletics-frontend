import { NextRequest, NextResponse } from "next/server";
import { getEventYearRanking, getEventYearRankingCount, getAvailableNationalities } from "@/lib/queries";
import { getAthletePhoto } from "@/lib/wikipedia";

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const event = searchParams.get("event");
  const gender = searchParams.get("gender");
  const yearParam = searchParams.get("year");
  const year = yearParam === "all" ? "all" : Number(yearParam) || new Date().getFullYear();
  const nationality = searchParams.get("nationality") || undefined;
  const ageCategory = searchParams.get("ageCategory") || undefined;
  const sortBy = searchParams.get("sortBy") === "points" ? "points" : "mark";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const includeIllegalWind = searchParams.get("includeIllegalWind") === "true";

  if (!event || !gender) {
    return NextResponse.json({ error: "Missing event or gender" }, { status: 400 });
  }

  const [rows, total, nationalities] = await Promise.all([
    getEventYearRanking(event, gender, year, page, PAGE_SIZE, { nationality, ageCategory, sortBy, includeIllegalWind }),
    getEventYearRankingCount(event, gender, year, { nationality, ageCategory, includeIllegalWind }),
    getAvailableNationalities(event, gender, year),
  ]);
  const withPhotos = await Promise.all(
    rows.map(async (r) => ({ ...r, photo: await getAthletePhoto(r.display_name) }))
  );
  return NextResponse.json({ rows: withPhotos, total, pageSize: PAGE_SIZE, nationalities });
}
