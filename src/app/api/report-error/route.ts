import { NextRequest, NextResponse } from "next/server";
import { saveErrorReport } from "@/lib/errorReports";

// Public endpoint -- any visitor can report a data error from any page, no
// auth. Basic sanity limits only (no rate limiting yet; revisit if abused).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const pageUrl = typeof body?.pageUrl === "string" ? body.pageUrl.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!pageUrl || !description || description.length < 5) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  await saveErrorReport({ pageUrl, description });
  return NextResponse.json({ ok: true });
}
