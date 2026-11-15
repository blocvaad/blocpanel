// src/app/api/management-companies/billing/route.ts
//
// מסלול לחברת ניהול בלי חיוב (פיילוט / שותפות) — סופר-אדמין בלבד, עם אישור בקוד (step-up, PANEL-PAY א1, החלטה 364).
//
//   grant      → plan = X, plan_expires = NULL, comp_reason = סיבה.
//                נחסם כשלחברה מנוי PayPlus חי — אסור שני מקורות זכאות לאותה חברה.
//   end_grant  → comp_reason = NULL, plan_expires = now(). לא "כיבוי": הבניינים
//                עוברים את אותו מסלול כמו חברה שלא שילמה — 7 ימי חסד ואז 14 ימי
//                חסד יציאה בלי חיוב אוטומטי (120). אף ועד לא מתעורר בלי Pro.
//
// PANEL-PAY א1 (החלטה 362, C1): הפאנל לא כותב יותר ל-management_companies. הבקשה נחתמת ונשלחת ל-bloc
// (/api/internal/plans: company_grant / company_end_grant), שבודק את אותם כללים (חברה לא מאושרת, מנוי חי, אין הענקה),
// כותב, רושם ב-audit_logs שלו ושולח את ההודעה לבעלים. כשל קריאה שם — 503, לא "אין מנוי".
// יומן הפאנל: MANAGEMENT_PLAN_GRANTED / MANAGEMENT_PLAN_GRANT_ENDED עם התוצאה; כשל — MONEY_ACTION_FAILED / _UNKNOWN.
import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { callBloc } from "@/lib/blocApi";
import { requireStepUp } from "@/lib/stepUp";
import { parseBody, companyGrantSchema } from "@/lib/validation";
import { actorOf, badShape, failureAudit, firstIp, moneyFailure, planRow } from "@/lib/moneyActions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const g = await guard({ role: "superadmin" });
  if (!g.ok) return g.response;
  const p = await parseBody(req, companyGrantSchema);
  if (!p.ok) return p.response;
  const su = requireStepUp(g.session, req);
  if (!su.ok) return su.response;
  const body = p.data;
  const ip = firstIp(req.headers.get("x-forwarded-for"));

  const grant = body.action === "grant";
  const audit = grant ? "MANAGEMENT_PLAN_GRANTED" : "MANAGEMENT_PLAN_GRANT_ENDED";
  const input = body.action === "grant" ? { plan: body.plan, reason: body.reason } : {};

  const r = await callBloc("/api/internal/plans", {
    actor: actorOf(g.session),
    action: grant ? "company_grant" : "company_end_grant",
    company_id: body.id,
    ...input,
  });

  if (!r.ok) {
    const a = failureAudit(r, audit);
    await auditLog(g.session, a.name, "management_company", body.id, { ...a.meta, ...input }, ip);
    const f = moneyFailure(r, "company_plan");
    return NextResponse.json({ error: f.error, code: f.code }, { status: f.status });
  }

  // סקירה #6: הצלחה רק עם ok === true ושורת החברה — אחרת "ייתכן שבוצע".
  const company = planRow(r.data.company);
  if (r.data.ok !== true || !company) {
    const b = badShape(audit);
    await auditLog(g.session, b.audit.name, "management_company", body.id, { ...b.audit.meta, ...input }, ip);
    return NextResponse.json({ error: b.error, code: b.code }, { status: b.status });
  }
  // notified — bloc שלח לבעלים הודעה (הענקה / סיום); unchanged — זו כבר ההענקה, לא נכתב דבר.
  const notified = r.data.notified === true;
  const unchanged = r.data.unchanged === true;
  await auditLog(g.session, audit, "management_company", body.id, { ...input, result: company, notified, ...(unchanged ? { unchanged: true } : {}) }, ip);
  return NextResponse.json({ ok: true, company, notified, ...(unchanged ? { unchanged: true } : {}) });
}
