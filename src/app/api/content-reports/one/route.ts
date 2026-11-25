// src/app/api/content-reports/one/route.ts — bloc SAFETY-1: פריט אחד שדווח, עם התוכן — POST (לא GET: הפתיחה נרשמת, ב-bloc לפני
// שהתוכן יוצא וביומן הפאנל) · content_reports.read. no-store.
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { parseBody } from "@/lib/validation";
import { crOneSchema } from "@/lib/contentReports";
import { loadContentReport } from "@/lib/contentReportsServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  const g = await guard({ permission: "content_reports.read" });
  if (!g.ok) return g.response;
  const parsed = await parseBody(req, crOneSchema);
  if (!parsed.ok) return parsed.response;
  const data = await loadContentReport(g.session, { source: parsed.data.source, id: parsed.data.id.toLowerCase() });
  if (data.state === "not_found") return NextResponse.json(data, { status: 404, headers: noStore });
  if (data.state === "missing") return NextResponse.json(data, { status: 503, headers: noStore });
  if (data.state === "error") return NextResponse.json(data, { status: 502, headers: noStore });
  return NextResponse.json(data, { headers: noStore });
}
