import { NextRequest, NextResponse } from "next/server";
import { saveVerdict } from "@/lib/registry";

// Saves a ✓/✗ verdict on a registry-vs-production difference. The page is
// unlisted but public, so in production writes need ADMIN_WRITE_TOKEN
// (sent as x-admin-token, remembered by the page in localStorage). Locally
// (next dev) no token is needed.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    const expected = process.env.ADMIN_WRITE_TOKEN;
    if (!expected || req.headers.get("x-admin-token") !== expected) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }
  const body = await req.json();
  if (!body?.diff_id || !["ok", "wrong"].includes(body.verdict)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  await saveVerdict({
    diff_id: String(body.diff_id),
    kind: String(body.kind ?? ""),
    verdict: body.verdict,
    note: String(body.note ?? "").slice(0, 1000),
    competition_ids: Array.isArray(body.competition_ids) ? body.competition_ids.map(String) : [],
    raw_names: Array.isArray(body.raw_names) ? body.raw_names.map(String) : [],
  });
  return NextResponse.json({ ok: true });
}
