import { NextRequest, NextResponse } from "next/server";
import { getLatestRaces } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const event = searchParams.get("event") || undefined;
  const tier = searchParams.get("tier") || undefined;

  const races = await getLatestRaces(10, { event, tier });
  return NextResponse.json(races);
}
