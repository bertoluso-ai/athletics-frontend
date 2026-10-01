import { NextRequest, NextResponse } from "next/server";
import { getEventYearRanking, getGlobalYearRanking, getAthleteSlugs } from "@/lib/queries";
import { getAthletePhoto } from "@/lib/wikipedia";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const event = searchParams.get("event");
  const gender = searchParams.get("gender");
  const year = Number(searchParams.get("year")) || new Date().getFullYear();

  if (!event || !gender) {
    return NextResponse.json({ error: "Missing event or gender" }, { status: 400 });
  }

  // "all": total points across every discipline, not one event's leaderboard
  // -- same meaning as the full Rankings page's event=all (see
  // /api/rankings), reused here for the Home stats widget's "All" group.
  const rows =
    event === "all"
      ? await getGlobalYearRanking(gender, year, 1, 10)
      : await getEventYearRanking(event, gender, year, 1, 10, { sortBy: "points" });
  const slugs = await getAthleteSlugs(rows.map((r) => r.athlete_id));
  const withPhotos = await Promise.all(
    rows.map(async (r) => ({ ...r, slug: slugs.get(r.athlete_id) ?? null, photo: await getAthletePhoto(r.display_name) }))
  );
  return NextResponse.json(withPhotos);
}
