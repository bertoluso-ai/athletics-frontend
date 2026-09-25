import { NextRequest, NextResponse } from "next/server";
import { getEventYearlyProgression } from "@/lib/queries";

// Best mark of every year for one event + gender (optionally an age
// category), for the progression chart of Rankings > By discipline.
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const event = sp.get("event");
  const gender = sp.get("gender");
  if (!event || !gender) return NextResponse.json({ error: "Missing event or gender" }, { status: 400 });
  const rows = await getEventYearlyProgression(event, gender, sp.get("ageCategory") || undefined);
  return NextResponse.json(rows);
}
