import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { parseBody, buildingUpdateSchema, buildingArchiveSchema, buildingSuspendSchema } from "@/lib/validation";
import { checkLiveSubscription, openStopTask } from "@/lib/liveSubscriptionFlow";
import { hasPlanField, PLAN_MOVED_TEXT } from "@/lib/buildingPlan";

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
  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "גוף בקשה לא תקין" }, { status: 400 }); }

  // השעיה / הפעלה — פעולה נפרדת (bloc חוסם את הדיירים של בניין מושעה, proxy). קודם המסך שלח
  // { is_active } לסכמת העריכה, שדוחה אותו — וההשעיה לא קרתה, בלי שום הודעה.
  if (raw && typeof raw === "object" && "is_active" in raw) {
    const s = await parseBody({ json: async () => raw }, buildingSuspendSchema);
    if (!s.ok) return s.response;
    // BILL-1b (החלטה 319): השעיה של בניין עם מנוי חי — עוצרים ושואלים, לפני כל כתיבה. הפעלה מחדש לא נבדקת.
    let liveConfirmed = false;
    if (s.data.is_active === false) {
      const chk = await checkLiveSubscription(adminClient, { type: "building", id }, "suspend", s.data.confirm_live_subscription === true, session.role);
      if ("response" in chk) return chk.response;
      liveConfirmed = chk.live;
    }
    const { data: row, error } = await adminClient.from("buildings").update({ is_active: s.data.is_active })
      .eq("id", id).not("is_archived", "is", true).select("id, name, is_active").maybeSingle();
    if (error) {
      console.error("[building suspend]", error);
      return NextResponse.json({ error: s.data.is_active ? "ההפעלה נכשלה. נסו שוב." : "ההשעיה נכשלה. נסו שוב." }, { status: 500 });
    }
    if (!row) return NextResponse.json({ error: "הבניין לא נמצא, או שהוא בארכיון" }, { status: 404 });
    const stopTask = liveConfirmed ? await openStopTask({ type: "building", id }, "building_suspended", session.email) : "none";
    await auditLog(session, s.data.is_active ? "ACTIVATE_BUILDING" : "SUSPEND_BUILDING", "building", id, {
      name: row.name, ...(s.data.reason ? { reason: s.data.reason } : {}),
      ...(liveConfirmed ? { live_subscription: true, stop_task: stopTask } : {}),
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
  const body = parsed.data;

  if (Object.keys(body).length === 0) return NextResponse.json({ error: "אין שדות לעדכון" }, { status: 400 });

  const { data, error } = await adminClient.from("buildings").update({ ...body }).eq("id", id).select().single();
  if (error) {
    console.error("[building update]", error);
    return NextResponse.json({ error: "שמירת הפרטים נכשלה. נסו שוב." }, { status: 500 });
  }
  await auditLog(session, "UPDATE_BUILDING", "building", id, { changes: body }, ip);
  return NextResponse.json({ data });
}

// Archive building - legal compliant, data preserved
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard({ role: "superadmin" });
  if (!g.ok) return g.response;
  const session = g.session;

  const { id } = await params;
  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  // בלי גוף (הכפתור בדף הבניין שלח DELETE ריק וקיבל 400) — סיבה ברירת מחדל.
  const raw = await req.json().catch(() => ({}));
  const parsed = await parseBody({ json: async () => raw ?? {} }, buildingArchiveSchema);
  if (!parsed.ok) return parsed.response;
  const reason = parsed.data.reason?.trim() || "הועבר לארכיון על ידי צוות bloc";

  // BILL-1b (החלטה 319): ארכוב של בניין עם מנוי חי — עוצרים ושואלים, לפני כל כתיבה.
  const chk = await checkLiveSubscription(adminClient, { type: "building", id }, "archive", parsed.data.confirm_live_subscription === true, session.role);
  if ("response" in chk) return chk.response;

  // ── ארכוב אטומי (P0.6/P0.13) ──
  // buildings.is_archived + חסימת כל הדיירים חייבים לקרות ביחד. קודם זו
  // הייתה שתי כתיבות נפרדות, והשנייה (חסימת דיירים) אף לא נבדקה לשגיאה —
  // כך שבניין יכול היה להישאר archived בעוד הדיירים עדיין approved (גישה).
  // ה-RPC עוטף את שתיהן בטרנזקציה אחת.
  const { data: rows, error } = await adminClient.rpc("admin_archive_building", {
    p_building_id: id,
    p_reason: reason,
  });

  if (error) {
    if ((error.message || "").includes("building_not_found"))
      return NextResponse.json({ error: "בניין לא נמצא" }, { status: 404 });
    console.error("[building archive]", error);
    return NextResponse.json({ error: "שגיאה בארכוב" }, { status: 500 });
  }

  const result = Array.isArray(rows) ? rows[0] : rows;

  const stopTask = chk.live ? await openStopTask({ type: "building", id }, "building_archived", session.email) : "none";
  await auditLog(session, "ARCHIVE_BUILDING", "building", id, {
    name: result?.building_name,
    blocked: result?.blocked_count,
    reason,
    note: "נתונים שמורים לפי GDPR — לא נמחקו",
    ...(chk.live ? { live_subscription: true, stop_task: stopTask } : {}),
  }, ip);
  if (stopTask === "failed") {
    await auditLog(session, "ARCHIVE_BUILDING_STOP_TASK_FAILED", "building", id, { name: result?.building_name, live_subscription: true }, ip);
  }

  return NextResponse.json({ ok: true, archived: true, stop_task: stopTask });
}
