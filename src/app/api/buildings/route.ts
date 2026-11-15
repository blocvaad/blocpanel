// src/app/api/buildings/route.ts — בניין חדש (PANEL-PAY א2, החלטה 367, C1).
//
// הפאנל לא כותב ל-buildings: הבקשה נחתמת ונשלחת ל-bloc (/api/internal/buildings, action 'create'), שמייצר את קוד
// ההצטרפות, פותח את הבניין במסלול ברירת המחדל (החלטה 363 — מסלול בלי חיוב רק מהכרטיס בדף הבניין) וממנה את ראש הוועד
// באותה בקשה (founder — אותו מסלול של /api/internal/members). כשל במינוי משאיר את הבניין: bloc עונה founder 'failed',
// והמסך אומר מה קרה ומה עושים. עד עכשיו הפאנל הכניס את השורה בעצמו ושלח בקשה שנייה ל-members.
// הרשאה: buildings.modify (admin, superadmin) — כאן ושוב ב-bloc לפי ה-actor. מינוי ראש ועד — עם קוד אישור (step-up,
// החלטה 364), לפני הקריאה ל-bloc: הניסיון החוזר אחרי הקוד לא פותח בניין שני. בלי ראש ועד — בלי קוד.
// יומן הפאנל: CREATE_BUILDING עם השורה ש-bloc החזיר; כשל — BLOC_ACTION_FAILED, או BLOC_ACTION_UNKNOWN כשלא ידוע אם נפתח.
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { parseBody, buildingCreateSchema } from "@/lib/validation";
import { auditLog } from "@/lib/auth";
import { notifyExternal } from "@/lib/externalNotify";
import { callBloc } from "@/lib/blocApi";
import { hasPlanField, PLAN_MOVED_TEXT } from "@/lib/buildingPlan";
import { requireStepUp } from "@/lib/stepUp";
import { actorOf, firstIp } from "@/lib/moneyActions";
import { actionBadShape, actionFailureAudit, blocActionFailure, buildingRow, founderOutcome } from "@/lib/blocActions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET הוסר (UI-R5c-1): שימש רק את בורר ההעברה הישן — החזיר לכל סשן (גם viewer) את כל העמודות של כל
// הבניינים, כולל קודי הצטרפות ובניינים בארכיון. דף האדם טוען את הבניינים בשרת.

export async function POST(req: NextRequest) {
  const g = await guard({ permission: "buildings.modify" });
  if (!g.ok) return g.response;
  const session = g.session;

  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "גוף בקשה לא תקין" }, { status: 400 }); }
  if (hasPlanField(raw)) return NextResponse.json({ error: PLAN_MOVED_TEXT, code: "plan_moved" }, { status: 400 });
  const p = await parseBody({ json: async () => raw }, buildingCreateSchema);
  if (!p.ok) return p.response;
  const { name, address, max_tenants, admin_email } = p.data;
  if (!name.trim()) return NextResponse.json({ error: "שם חובה" }, { status: 400 });
  // PANEL-PAY א1 (החלטה 364): מייל של ראש ועד = מינוי ראש הוועד — אישור בקוד, לפני bloc.
  if (admin_email) {
    const su = requireStepUp(session, req);
    if (!su.ok) return su.response;
  }

  const ip = firstIp(req.headers.get("x-forwarded-for"));
  const building = { name, ...(address !== undefined ? { address } : {}), max_tenants: max_tenants ?? 50 };
  const r = await callBloc("/api/internal/buildings", {
    actor: actorOf(session), action: "create", building,
    ...(admin_email ? { founder: { email: admin_email } } : {}),
  });

  if (!r.ok) {
    const a = actionFailureAudit(r, "CREATE_BUILDING");
    await auditLog(session, a.name, "building", undefined, { ...a.meta, name, founder_email: admin_email ?? null }, ip);
    const f = blocActionFailure(r, "building_create");
    return NextResponse.json({ error: f.error, code: f.code }, { status: f.status });
  }
  // הצלחה רק עם ok === true ושורת הבניין — אחרת "ייתכן שנפתח" (רעננו לפני שמנסים שוב: ניסיון חוזר עלול לפתוח בניין שני).
  const row = buildingRow(r.data.building);
  if (r.data.ok !== true || !row) {
    const b = actionBadShape("CREATE_BUILDING");
    await auditLog(session, b.audit.name, "building", undefined, { ...b.audit.meta, name, founder_email: admin_email ?? null }, ip);
    return NextResponse.json({ error: b.error, code: b.code }, { status: b.status });
  }

  const founder = admin_email ? founderOutcome(r.data) : undefined;
  await auditLog(session, "CREATE_BUILDING", "building", row.id, {
    name,
    founder: admin_email && founder ? { email: admin_email, assigned: founder.ok, code: founder.ok ? null : founder.code } : null,
    result: row,
  }, ip);

  await notifyExternal("building.created", { name: row.name, plan: "free", id: row.id });

  return NextResponse.json({ data: row, ...(founder ? { founder } : {}) });
}
