// src/app/api/content-reports/route.ts — bloc SAFETY-1 (MG-S1241, החלטות 676–677): התור והפעולות של הדיווחים על תוכן מהצ'אט, מהלוח
// ומהשוק.
//   GET  — ?status&source&order → התור (בלי תוכן ובלי מי דיווח) · content_reports.read. הנתונים לא נכנסים ל-HTML של הדף (ה-service
//          worker של הפאנל שומר עותק של כל דף, ולא של /api/; התשובה no-store).
//   POST — { action: "hide" | "restore" | "refer", source, id, note? } → bloc החתום (/api/internal/content-reports) · content_reports.manage
//          (מנהל וסופר-אדמין; נבדק גם ב-bloc).
// הצלחה רק כש-bloc ענה ok עם changed; אחרת "לא ברור אם בוצע — רעננו", אף פעם לא הצלחה. ביומן הפאנל: CONTENT_REPORT_HIDE / RESTORE /
// REFER — רק כשמשהו השתנה, בלי ההערה עצמה (היא ביומן של bloc); כשל — BLOC_ACTION_FAILED / BLOC_ACTION_UNKNOWN.
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { callBloc } from "@/lib/blocApi";
import { parseBody } from "@/lib/validation";
import { actorOf, firstIp } from "@/lib/moneyActions";
import { adsFailureAudit } from "@/lib/adsActions";
import { CR_ACTION_AUDIT, crActionAnswer, crActionSchema, crFailure, crFilterOf } from "@/lib/contentReports";
import { loadContentReports } from "@/lib/contentReportsServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const g = await guard({ permission: "content_reports.read" });
  if (!g.ok) return g.response;
  const data = await loadContentReports(g.session, crFilterOf(Object.fromEntries(req.nextUrl.searchParams.entries())));
  if (data.state === "missing") return NextResponse.json(data, { status: 503, headers: noStore });
  if (data.state === "error") return NextResponse.json(data, { status: 502, headers: noStore });
  return NextResponse.json(data, { headers: noStore });
}

export async function POST(req: NextRequest) {
  const g = await guard({ permission: "content_reports.manage" });
  if (!g.ok) return g.response;
  const session = g.session;
  const parsed = await parseBody(req, crActionSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const ip = firstIp(req.headers.get("x-forwarded-for"));
  const audit = CR_ACTION_AUDIT[body.action];
  const meta: Record<string, unknown> = { source: body.source, has_note: !!body.note?.trim() };
  const r = await callBloc("/api/internal/content-reports", {
    actor: actorOf(session), action: body.action, source: body.source, id: body.id, ...(body.note?.trim() ? { note: body.note.trim() } : {}),
  });
  if (!r.ok) {
    const a = adsFailureAudit(r, audit);
    await auditLog(session, a.name, "content_report", body.id, { ...a.meta, ...meta }, ip);
    const f = crFailure(r, "action");
    return NextResponse.json({ error: f.error, code: f.code }, { status: f.status, headers: noStore });
  }
  const ans = crActionAnswer(r.data);
  if (!ans) {
    await auditLog(session, "BLOC_ACTION_UNKNOWN", "content_report", body.id, { action: audit, outcome: "unknown", code: "bad_shape", ...meta }, ip);
    return NextResponse.json({ error: "לא ברור אם הפעולה בוצעה. רעננו את הדף.", code: "bad_shape" }, { status: 502, headers: noStore });
  }
  if (ans.changed) await auditLog(session, audit, "content_report", body.id, { ...meta, closed: ans.closed, notified: ans.notified }, ip);
  return NextResponse.json({ ok: true, action: body.action, ...ans }, { headers: noStore });
}
