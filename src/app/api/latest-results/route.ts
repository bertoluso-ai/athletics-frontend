import { NextRequest, NextResponse } from "next/server";
import { getLatestRaces, getLatestResultsNationalities } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const event = searchParams.get("event") || undefined;
  const tier = searchParams.get("tier") || undefined;
  const nationality = searchParams.get("nationality") || undefined;

  const [races, nationalities] = await Promise.all([
    getLatestRaces(10, { event, tier, nationality }),
    getLatestResultsNationalities(),
  ]);
  return NextResponse.json({ races, nationalities });
}
