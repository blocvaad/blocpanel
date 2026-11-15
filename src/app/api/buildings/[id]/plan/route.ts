// src/app/api/buildings/[id]/plan/route.ts — מסלול לבניין בלי חיוב (PANEL-PAY א1, החלטות 362–364, C1).
//
// POST { action: 'grant', plan, comp_reason, expected_plan? } | { action: 'end_grant', expected_plan? }
// סופר-אדמין בלבד (החלטה 363 — עד עכשיו גם admin יכול היה להעניק מסלול מטופס העריכה), עם אישור בקוד (step-up).
// הפאנל לא כותב ל-buildings: הבקשה נחתמת ונשלחת ל-bloc (/api/internal/plans), שבודק מנוי משלם, כיסוי של חברת ניהול,
// בניין בארכיון ו-expected_plan, כותב, ורושם ב-audit_logs שלו (לפני → אחרי). כשל קריאה שם — 503 read_failed, אף פעם "אין".
// יומן הפאנל: הצלחה — BUILDING_PLAN_GRANTED / BUILDING_PLAN_GRANT_ENDED עם התוצאה של bloc; כשל — MONEY_ACTION_FAILED
// (או MONEY_ACTION_UNKNOWN כשלא ידוע אם בוצע), עם הקוד של bloc.
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { callBloc } from "@/lib/blocApi";
import { requireStepUp } from "@/lib/stepUp";
import { parseBody, buildingPlanActionSchema } from "@/lib/validation";
import { actorOf, badShape, failureAudit, firstIp, moneyFailure, planRow } from "@/lib/moneyActions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard({ role: "superadmin" });
  if (!g.ok) return g.response;
  const session = g.session;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "מזהה בניין לא תקין", code: "invalid" }, { status: 400 });

  const parsed = await parseBody(req, buildingPlanActionSchema);
  if (!parsed.ok) return parsed.response;
  const su = requireStepUp(session, req);
  if (!su.ok) return su.response;
  const body = parsed.data;
  const ip = firstIp(req.headers.get("x-forwarded-for"));

  const grant = body.action === "grant";
  const audit = grant ? "BUILDING_PLAN_GRANTED" : "BUILDING_PLAN_GRANT_ENDED";
  const input = {
    ...(body.action === "grant" ? { plan: body.plan, comp_reason: body.comp_reason } : {}),
    expected_plan: body.expected_plan ?? null,
  };

  const r = await callBloc("/api/internal/plans", {
    actor: actorOf(session),
    action: grant ? "building_grant" : "building_end_grant",
    building_id: id,
    ...(body.action === "grant" ? { plan: body.plan, comp_reason: body.comp_reason } : {}),
    ...(body.expected_plan ? { expected_plan: body.expected_plan } : {}),
  });

  if (!r.ok) {
    const a = failureAudit(r, audit);
    await auditLog(session, a.name, "building", id, { ...a.meta, ...input }, ip);
    const f = moneyFailure(r, "building_plan");
    return NextResponse.json({ error: f.error, code: f.code }, { status: f.status });
  }

  // סקירה #6: הצלחה רק עם ok === true ושורת הבניין — אחרת "ייתכן שבוצע".
  const building = planRow(r.data.building);
  if (r.data.ok !== true || !building) {
    const b = badShape(audit);
    await auditLog(session, b.audit.name, "building", id, { ...b.audit.meta, ...input }, ip);
    return NextResponse.json({ error: b.error, code: b.code }, { status: b.status });
  }
  // unchanged — bloc מצא שזו כבר ההענקה (אותו מסלול ואותה סיבה) ולא כתב דבר.
  const unchanged = r.data.unchanged === true;
  await auditLog(session, audit, "building", id, { ...input, result: building, ...(unchanged ? { unchanged: true } : {}) }, ip);
  return NextResponse.json({ ok: true, building, ...(unchanged ? { unchanged: true } : {}) });
}
