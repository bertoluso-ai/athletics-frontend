import { NextRequest, NextResponse } from "next/server";
import { getEventYearBestMarks } from "@/lib/queries";
import { getAthletePhoto } from "@/lib/wikipedia";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const event = searchParams.get("event");
  const gender = searchParams.get("gender");
  const year = Number(searchParams.get("year")) || new Date().getFullYear();

  if (!event || !gender) {
    return NextResponse.json({ error: "Missing event or gender" }, { status: 400 });
  }

  const rows = await getEventYearBestMarks(event, gender, year, 20);
  const withPhotos = await Promise.all(
    rows.map(async (r) => ({ ...r, photo: await getAthletePhoto(r.display_name) }))
  );
  return NextResponse.json(withPhotos);
}
