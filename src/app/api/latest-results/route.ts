import { NextRequest, NextResponse } from "next/server";
import { getLatestRaces } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const event = searchParams.get("event") || undefined;
  const tier = searchParams.get("tier") || undefined;

  // "All categories" (no tier) needs far more candidates: tier F alone is ~10x the rest
  const races = await getLatestRaces(tier ? 15 : 60, { event, tier });
  return NextResponse.json(races);
}
