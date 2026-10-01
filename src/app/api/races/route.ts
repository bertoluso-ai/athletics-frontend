import { NextRequest, NextResponse } from "next/server";
import { getTopRaces } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const event = searchParams.get("event");
  const gender = searchParams.get("gender");
  const year = Number(searchParams.get("year")) || new Date().getFullYear();
  const sortBy = searchParams.get("sortBy") === "recent" ? "recent" : "quality";
  const indoor = searchParams.get("indoor") === "true";

  if (!event || !gender) {
    return NextResponse.json({ error: "Missing event or gender" }, { status: 400 });
  }

  const rows = await getTopRaces(event, gender, year, sortBy, 10, indoor);
  return NextResponse.json(rows);
}
