import { NextRequest, NextResponse } from "next/server";
import {
  getEventYearRanking,
  getEventYearRankingCount,
  getAvailableNationalities,
  getGlobalYearRanking,
  getGlobalYearRankingCount,
  getGlobalAvailableNationalities,
  getRelayYearRanking,
  getRelayYearRankingCount,
} from "@/lib/queries";
import { getAthletePhoto } from "@/lib/wikipedia";
import { isRelayEvent } from "@/lib/events";

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
  const indoor = searchParams.get("indoor") === "true";

  if (!gender) {
    return NextResponse.json({ error: "Missing gender" }, { status: 400 });
  }

  // "all" is the global ranking -- total points across every discipline,
  // not a per-discipline leaderboard, so it's a different query shape
  // (no mark/wind, sorted by points only).
  if (event === "all") {
    const [rows, total, nationalities] = await Promise.all([
      getGlobalYearRanking(gender, year, page, PAGE_SIZE, { nationality, ageCategory }),
      getGlobalYearRankingCount(gender, year, { nationality, ageCategory }),
      getGlobalAvailableNationalities(gender, year),
    ]);
    const withPhotos = await Promise.all(
      rows.map(async (r) => ({ ...r, photo: await getAthletePhoto(r.display_name) }))
    );
    return NextResponse.json({ rows: withPhotos, total, pageSize: PAGE_SIZE, nationalities });
  }

  if (!event) {
    return NextResponse.json({ error: "Missing event or gender" }, { status: 400 });
  }

  // Relay results attach the team's shared mark to every named leg, so the
  // per-athlete ranking below would list teammates as separate unrelated
  // rows. Team-by-nationality ranking instead, same roster-collapse as the
  // event page's All-Time Best relay list.
  if (isRelayEvent(event)) {
    const [rows, total, nationalities] = await Promise.all([
      getRelayYearRanking(event, gender, year, page, PAGE_SIZE, { nationality, sortBy }),
      getRelayYearRankingCount(event, gender, year, { nationality }),
      getAvailableNationalities(event, gender, year),
    ]);
    return NextResponse.json({ rows, total, pageSize: PAGE_SIZE, nationalities });
  }

  const [rows, total, nationalities] = await Promise.all([
    getEventYearRanking(event, gender, year, page, PAGE_SIZE, { nationality, ageCategory, sortBy, includeIllegalWind, indoor }),
    getEventYearRankingCount(event, gender, year, { nationality, ageCategory, includeIllegalWind, indoor }),
    getAvailableNationalities(event, gender, year),
  ]);
  const withPhotos = await Promise.all(
    rows.map(async (r) => ({ ...r, photo: await getAthletePhoto(r.display_name) }))
  );
  return NextResponse.json({ rows: withPhotos, total, pageSize: PAGE_SIZE, nationalities });
}
