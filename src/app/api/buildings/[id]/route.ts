// src/app/api/buildings/[id]/route.ts — בניין: קריאה, עריכה, השעיה / הפעלה, העברה לארכיון.
//
// PANEL-PAY א2 (החלטות 367, 369, C1): הפאנל לא כותב ל-buildings ולא מריץ את admin_archive_building. עריכה, השעיה / הפעלה
// וארכוב נשלחים חתומים ל-bloc (/api/internal/buildings: update / set_active / archive), שבודק הרשאה לפי ה-actor (כמו כאן:
// buildings.modify, ארכוב — סופר-אדמין), כותב ורושם ביומן שלו. השעיה / הפעלה וארכוב — עם קוד אישור (step-up, החלטה
// 369), אחרי בדיקת הגוף ולפני bloc; עריכה — בלי.
// BILL-1b (החלטה 319): בהשעיה ובארכוב bloc בודק מנוי חי ועונה 409 live_subscription; הפאנל מציג את אותו חלון אישור (409
// LIVE_SUBSCRIPTION), והאישור (confirm_live_subscription) עובר ל-bloc — שאוכף שרק סופר-אדמין מאשר (403
// live_subscription_forbidden), פותח את משימת העצירה אחרי הכתיבה ומחזיר stop_task.
// יומן הפאנל: UPDATE_BUILDING / SUSPEND_BUILDING / ACTIVATE_BUILDING / ARCHIVE_BUILDING עם התוצאה של bloc; כשל —
// BLOC_ACTION_FAILED, או BLOC_ACTION_UNKNOWN כשלא ידוע אם בוצע (bloc לא ענה בזמן / תשובה לא ברורה).
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { callBloc } from "@/lib/blocApi";
import { requireStepUp } from "@/lib/stepUp";
import { parseBody, buildingUpdateSchema, buildingArchiveSchema, buildingSuspendSchema } from "@/lib/validation";
import { liveSubscriptionConflict } from "@/lib/liveSubscriptionFlow";
import { hasPlanField, PLAN_MOVED_TEXT } from "@/lib/buildingPlan";
import { actorOf, firstIp } from "@/lib/moneyActions";
import {
  actionBadShape, actionFailureAudit, activeRow, archiveAnswer, blocActionFailure, buildingRow, liveConflictOf, stopTaskOf,
} from "@/lib/blocActions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const badId = () => NextResponse.json({ error: "מזהה בניין לא תקין", code: "invalid" }, { status: 400 });

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard();
  if (!g.ok) return g.response;
  const { id } = await params;
  const { data, error } = await adminClient.from("buildings").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard({ permission: "buildings.modify" });
  if (!g.ok) return g.response;
  const session = g.session;
  const { id } = await params;
  if (!UUID.test(id)) return badId();
  const ip = firstIp(req.headers.get("x-forwarded-for"));
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "גוף בקשה לא תקין" }, { status: 400 }); }

  // השעיה / הפעלה — פעולה נפרדת (bloc חוסם את הדיירים של בניין מושעה, proxy). קודם המסך שלח
  // { is_active } לסכמת העריכה, שדוחה אותו — וההשעיה לא קרתה, בלי שום הודעה.
  if (raw && typeof raw === "object" && "is_active" in raw) {
    const s = await parseBody({ json: async () => raw }, buildingSuspendSchema);
    if (!s.ok) return s.response;
    // החלטה 369: השעיה והפעלה — אישור בקוד, לפני bloc.
    const su = requireStepUp(session, req);
    if (!su.ok) return su.response;
    const audit = s.data.is_active ? "ACTIVATE_BUILDING" : "SUSPEND_BUILDING";
    // BILL-1b (החלטה 319): bloc בודק מנוי חי בהשעיה (הפעלה מחדש לא נבדקת) ועונה 409 live_subscription; האישור עובר אליו.
    const confirmed = s.data.is_active === false && s.data.confirm_live_subscription === true;
    const input = { is_active: s.data.is_active, ...(s.data.reason ? { reason: s.data.reason } : {}) };

    const r = await callBloc("/api/internal/buildings", {
      actor: actorOf(session), action: "set_active", building_id: id, is_active: s.data.is_active,
      ...(s.data.reason ? { reason: s.data.reason } : {}),
      ...(confirmed ? { confirm_live_subscription: true } : {}),
    });
    if (!r.ok) {
      const live = liveConflictOf(r, "suspend");
      if (live) return liveSubscriptionConflict(live.sub, "building", live.action);
      const a = actionFailureAudit(r, audit);
      await auditLog(session, a.name, "building", id, { ...a.meta, ...input, ...(confirmed ? { live_subscription: true } : {}) }, ip);
      const f = blocActionFailure(r, "building_active");
      return NextResponse.json({ error: f.error, code: f.code }, { status: f.status });
    }
    // הצלחה רק עם ok === true, השורה במצב שביקשנו ותוצאה מוכרת של משימת העצירה — אחרת "ייתכן שבוצע".
    const row = activeRow(r.data.building, s.data.is_active);
    const stopTask = stopTaskOf(r.data.stop_task);
    if (r.data.ok !== true || !row || !stopTask) {
      const b = actionBadShape(audit);
      await auditLog(session, b.audit.name, "building", id, { ...b.audit.meta, ...input, ...(confirmed ? { live_subscription: true } : {}) }, ip);
      return NextResponse.json({ error: b.error, code: b.code }, { status: b.status });
    }
    const live = stopTask !== "none";
    await auditLog(session, audit, "building", id, {
      name: row.name, ...(s.data.reason ? { reason: s.data.reason } : {}),
      ...(live ? { live_subscription: true, stop_task: stopTask } : {}),
      result: row,
    }, ip);
    if (stopTask === "failed") {
      await auditLog(session, "SUSPEND_BUILDING_STOP_TASK_FAILED", "building", id, { name: row.name, live_subscription: true }, ip);
    }
    return NextResponse.json({ data: row, stop_task: stopTask });
  }

  // PANEL-PAY א1 (החלטה 363): המסלול עבר לכרטיס "מסלול בלי חיוב" (סופר-אדמין, דרך bloc). עד עכשיו admin יכול היה להעניק
  // כאן מסלול בתשלום בלי חיוב (plan + comp_reason), והבדיקות לפני כן התעלמו מכשל קריאה (S1022).
  if (hasPlanField(raw)) return NextResponse.json({ error: PLAN_MOVED_TEXT, code: "plan_moved" }, { status: 400 });

  const parsed = await parseBody({ json: async () => raw }, buildingUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const { expected, ...body } = parsed.data;

  if (Object.keys(body).length === 0) return NextResponse.json({ error: "אין שדות לעדכון" }, { status: 400 });

  // עריכה — בלי קוד אישור (החלטה 369): שם, כתובת, מקסימום דיירים בלבד (הסכמה — strict). expected — מה שהמסך הראה.
  const r = await callBloc("/api/internal/buildings", {
    actor: actorOf(session), action: "update", building_id: id, patch: body, ...(expected ? { expected } : {}),
  });
  if (!r.ok) {
    const a = actionFailureAudit(r, "UPDATE_BUILDING");
    await auditLog(session, a.name, "building", id, { ...a.meta, changes: body }, ip);
    const f = blocActionFailure(r, "building_update");
    return NextResponse.json({ error: f.error, code: f.code }, { status: f.status });
  }
  const row = buildingRow(r.data.building);
  if (r.data.ok !== true || !row || row.id !== id) {
    const b = actionBadShape("UPDATE_BUILDING");
    await auditLog(session, b.audit.name, "building", id, { ...b.audit.meta, changes: body }, ip);
    return NextResponse.json({ error: b.error, code: b.code }, { status: b.status });
  }
  // unchanged — bloc מצא שהפרטים כבר כאלה ולא כתב דבר.
  const unchanged = r.data.unchanged === true;
  await auditLog(session, "UPDATE_BUILDING", "building", id, { changes: body, result: row, ...(unchanged ? { unchanged: true } : {}) }, ip);
  return NextResponse.json({ data: row, ...(unchanged ? { unchanged: true } : {}) });
}

// העברה לארכיון — הנתונים נשמרים (חוק שמירת מסמכים); bloc מארכב וחוסם את הדיירים באותה טרנזקציה (admin_archive_building).
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard({ role: "superadmin" });
  if (!g.ok) return g.response;
  const session = g.session;

  const { id } = await params;
  if (!UUID.test(id)) return badId();
  const ip = firstIp(req.headers.get("x-forwarded-for"));
  // בלי גוף (הכפתור בדף הבניין שלח DELETE ריק וקיבל 400) — סיבה ברירת מחדל.
  const raw = await req.json().catch(() => ({}));
  const parsed = await parseBody({ json: async () => raw ?? {} }, buildingArchiveSchema);
  if (!parsed.ok) return parsed.response;
  // החלטה 369: ארכוב — אישור בקוד, לפני bloc.
  const su = requireStepUp(session, req);
  if (!su.ok) return su.response;
  const reason = parsed.data.reason?.trim() || "הועבר לארכיון על ידי צוות bloc";
  const confirmed = parsed.data.confirm_live_subscription === true;

  const r = await callBloc("/api/internal/buildings", {
    actor: actorOf(session), action: "archive", building_id: id, reason,
    ...(confirmed ? { confirm_live_subscription: true } : {}),
  });
  if (!r.ok) {
    // BILL-1b: למנוי חי bloc עונה 409 live_subscription — אותו חלון אישור כמו קודם (לפני כל כתיבה; לא נרשם כ"נדחה").
    const live = liveConflictOf(r, "archive");
    if (live) return liveSubscriptionConflict(live.sub, "building", live.action);
    const a = actionFailureAudit(r, "ARCHIVE_BUILDING");
    await auditLog(session, a.name, "building", id, { ...a.meta, reason, ...(confirmed ? { live_subscription: true } : {}) }, ip);
    const f = blocActionFailure(r, "building_archive");
    return NextResponse.json({ error: f.error, code: f.code }, { status: f.status });
  }
  const done = archiveAnswer(r.data);
  if (!done) {
    const b = actionBadShape("ARCHIVE_BUILDING");
    await auditLog(session, b.audit.name, "building", id, { ...b.audit.meta, reason, ...(confirmed ? { live_subscription: true } : {}) }, ip);
    return NextResponse.json({ error: b.error, code: b.code }, { status: b.status });
  }
  const live = done.stop_task !== "none";
  await auditLog(session, "ARCHIVE_BUILDING", "building", id, {
    name: done.name,
    blocked: done.blocked,
    reason,
    note: "נתונים שמורים לפי GDPR — לא נמחקו",
    ...(live ? { live_subscription: true, stop_task: done.stop_task } : {}),
  }, ip);
  if (done.stop_task === "failed") {
    await auditLog(session, "ARCHIVE_BUILDING_STOP_TASK_FAILED", "building", id, { name: done.name, live_subscription: true }, ip);
  }

  return NextResponse.json({ ok: true, archived: true, stop_task: done.stop_task });
}
