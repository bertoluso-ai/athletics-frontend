import { NextRequest, NextResponse } from "next/server";
import { getEventYearBestMarks, getAthleteSlugs } from "@/lib/queries";
import { photoUrlsForRows } from "@/lib/wikipedia";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const event = searchParams.get("event");
  const gender = searchParams.get("gender");
  const year = Number(searchParams.get("year")) || new Date().getFullYear();

  if (!event || !gender) {
    return NextResponse.json({ error: "Missing event or gender" }, { status: 400 });
  }

  const rows = await getEventYearBestMarks(event, gender, year, 10);
  const slugs = await getAthleteSlugs(rows.map((r) => r.athlete_id));
  const photos = await photoUrlsForRows(rows);
  const withPhotos = rows.map((r, i) => ({ ...r, slug: slugs.get(r.athlete_id) ?? null, photo: photos[i] }));
  return NextResponse.json(withPhotos);
}
