import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { callBloc } from "@/lib/blocApi";
import { STUCK_CLOSE_TEXT } from "@/lib/billing";

export const dynamic = "force-dynamic";

// POST /api/billing/stuck-events — סגירת callback תקוע (BILL-1d, C3). אותה הרשאה כמו שאר פעולות המשימות (billing.manage).
// הפאנל לא כותב ל-billing_webhook_events: הוא שולח close_stuck_event חתום ל-bloc, שמסמן 'failed' עם "staff: <תיעוד>".
const Body = z.object({
  event_id: z.string().uuid(),
  note: z.string().trim().min(10, "נדרש תיעוד של 10 תווים לפחות").max(500, "התיעוד ארוך מדי (עד 500 תווים)"),
});

export async function POST(req: Request) {
  const g = await guard({ permission: "billing.manage" });
  if (!g.ok) return g.response;

  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "גוף הבקשה אינו JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "בקשה לא תקינה" }, { status: 400 });
  }
  const body = parsed.data;

  const r = await callBloc("/api/internal/billing", {
    action: "close_stuck_event", event_id: body.event_id, note: body.note, actor: g.session.email,
  });

  if (!r.ok) {
    if (r.status === 404) return NextResponse.json({ error: STUCK_CLOSE_TEXT.not_found, code: "not_found" }, { status: 404 });
    // 503 של bloc עצמו (קריאה/כתיבה נכשלה). חיבור לא מוגדר / כתובת עצמית — ההודעה של callBloc מסבירה מה לתקן.
    if (r.status === 503 && r.code !== "NOT_CONFIGURED" && r.code !== "SELF_URL") {
      return NextResponse.json({ error: STUCK_CLOSE_TEXT.unavailable, code: "unavailable" }, { status: 503 });
    }
    return NextResponse.json({ error: r.error, ...(r.code ? { code: r.code } : {}) }, { status: r.status });
  }

  if (r.data.result === "closed") {
    await auditLog(g.session, "BILLING_STUCK_EVENT_CLOSED", "billing_webhook_event", body.event_id, { note: body.note, actor_email: g.session.email });
    return NextResponse.json({ ok: true, result: "closed", message: STUCK_CLOSE_TEXT.closed });
  }
  if (r.data.result === "not_stuck") {
    return NextResponse.json({ ok: true, result: "not_stuck", message: STUCK_CLOSE_TEXT.not_stuck });
  }
  // תשובה לא מוכרת מ-bloc — לא מציגים הצלחה.
  return NextResponse.json({ error: "תשובה לא מוכרת מ-bloc — רעננו ובדקו.", code: "unknown_result" }, { status: 502 });
}
