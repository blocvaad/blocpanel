// src/app/api/dm-reports/route.ts — MOD-1 (bloc MG-S1179, החלטות 584–585): התור, "נבדק" ו"פתיחה מחדש" של דיווח על שיחה פרטית.
//
//   GET  — ?status&reason&building&person&order → התור (בלי תוכן) · dm_reports.read. סקירת MOD-1 (#2): הנתונים לא נכנסים ל-HTML
//          של הדף — ה-service worker של הפאנל שומר עותק של כל דף, ולא של /api/ (והתשובה no-store).
//   POST — { action: "review", id, note?, notify } | { action: "reopen", id } → bloc החתום (/api/internal/dm-reports) · dm_reports.manage
//          (מנהל וסופר-אדמין; נבדק גם ב-bloc). notify — הודעה למדווח/ת שהדיווח נבדק, בלי מה הוחלט (פעם אחת לדיווח).
//
// הצלחה רק כש-bloc ענה ok עם changed (ב"נבדק" — גם notified); אחרת "לא ברור אם בוצע — רעננו", אף פעם לא הצלחה. ביומן הפאנל:
// DM_REPORT_REVIEW / DM_REPORT_REOPEN — רק כשמשהו השתנה, ובלי ההערה עצמה (היא ביומן של bloc, ורק מנהלים רואים אותה בדיווח);
// כשל — BLOC_ACTION_FAILED / BLOC_ACTION_UNKNOWN.
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { callBloc } from "@/lib/blocApi";
import { parseBody } from "@/lib/validation";
import { actorOf, firstIp } from "@/lib/moneyActions";
import { adsFailureAudit } from "@/lib/adsActions";
import { DM_ACTION_AUDIT, dmActionAnswer, dmActionSchema, dmFailure, dmFilterOf } from "@/lib/dmReports";
import { loadDmReports } from "@/lib/dmReportsServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const g = await guard({ permission: "dm_reports.read" });
  if (!g.ok) return g.response;
  const data = await loadDmReports(g.session, dmFilterOf(Object.fromEntries(req.nextUrl.searchParams.entries())));
  if (data.state === "missing") return NextResponse.json(data, { status: 503, headers: noStore });
  if (data.state === "error") return NextResponse.json(data, { status: 502, headers: noStore });
  return NextResponse.json(data, { headers: noStore });
}

export async function POST(req: NextRequest) {
  const g = await guard({ permission: "dm_reports.manage" });
  if (!g.ok) return g.response;
  const session = g.session;
  const parsed = await parseBody(req, dmActionSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const ip = firstIp(req.headers.get("x-forwarded-for"));
  const audit = DM_ACTION_AUDIT[body.action];
  const meta: Record<string, unknown> = body.action === "review" ? { notify: body.notify, has_note: !!body.note?.trim() } : {};

  const payload = body.action === "review"
    ? { actor: actorOf(session), action: "review", id: body.id, notify: body.notify, ...(body.note?.trim() ? { note: body.note.trim() } : {}) }
    : { actor: actorOf(session), action: "reopen", id: body.id };
  const r = await callBloc("/api/internal/dm-reports", payload);
  if (!r.ok) {
    const a = adsFailureAudit(r, audit);
    await auditLog(session, a.name, "dm_report", body.id, { ...a.meta, ...meta }, ip);
    const f = dmFailure(r, "action");
    return NextResponse.json({ error: f.error, code: f.code }, { status: f.status, headers: noStore });
  }
  const ans = dmActionAnswer(body.action, r.data);
  if (!ans) {
    await auditLog(session, "BLOC_ACTION_UNKNOWN", "dm_report", body.id, { action: audit, outcome: "unknown", code: "bad_shape", ...meta }, ip);
    return NextResponse.json({ error: "לא ברור אם הפעולה בוצעה. רעננו את הדף.", code: "bad_shape" }, { status: 502, headers: noStore });
  }
  if (ans.changed) await auditLog(session, audit, "dm_report", body.id, { ...meta, ...(body.action === "review" ? { notified: ans.notified, already: ans.already } : {}) }, ip);
  return NextResponse.json({ ok: true, action: body.action, changed: ans.changed, notified: ans.notified, already: ans.already }, { headers: noStore });
}
