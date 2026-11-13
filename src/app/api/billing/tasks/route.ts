import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { callBloc } from "@/lib/blocApi";

export const dynamic = "force-dynamic";

// POST /api/billing/tasks — סגירת משימת חיוב (BILL-1a). סופר-אדמין בלבד (billing.manage).
// הפאנל לא כותב ל-billing_tasks / subscription_refunds: הוא שולח בקשה חתומה ל-bloc, שמריץ את ה-RPC
// (ושולח למשלם את "הוראת הקבע נעצרה" אחרי עצירה). done → mark_stopped (עצירה ידנית) / resolve_task (שאר הסוגים), dismiss → dismiss_task.
const USE_MARK_STOPPED_TEXT = "משימת עצירה ידנית נסגרת רק בלחיצה על \"עצרתי\" — כתבו בתיעוד מה נמצא ב-PayPlus.";

const USE_MARK_OLD_STOPPED_TEXT = "משימת עצירת הוראה ישנה נסגרת רק בלחיצה על \"עצרתי\" — כתבו בתיעוד מה נמצא ב-PayPlus.";
const SYSTEM_TASK_TEXT = "זו משימת מערכת — היא נסגרת אוטומטית. אין צורך לסגור אותה ידנית.";

const Body = z.object({
  task_id: z.string().uuid(),
  action: z.enum(["done", "dismiss"]),
  /** סוג המשימה (מהמסך). bloc מאמת מול השורה ועונה 409 על סוג לא מתאים — הוא לא נסמך על הערך הזה. */
  kind: z.string().trim().min(1).max(64),
  note: z.string().trim().min(10, "נדרש תיעוד של 10 תווים לפחות"),
});

// done: עצירה ידנית → mark_stopped; כל סוג אחר → resolve_task. dismiss → dismiss_task לכולם.
// stop_old_recurring (BILL-1b): done → mark_old_stopped (הדרך היחידה לסגור אותה); dismiss נשלח כמות שהוא ו-bloc עונה 409 use_mark_old_stopped.
function blocActionFor(action: "done" | "dismiss", kind: string): "mark_stopped" | "mark_old_stopped" | "resolve_task" | "dismiss_task" {
  if (action === "dismiss") return "dismiss_task";
  if (kind === "manual_stop_recurring") return "mark_stopped";
  if (kind === "stop_old_recurring") return "mark_old_stopped";
  return "resolve_task";
}

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
    action: blocActionFor(body.action, body.kind), task_id: body.task_id, note: body.note, actor: g.session.email,
  });

  if (!r.ok) {
    // עצירה ידנית נסגרת רק ב"עצרתי" — bloc עונה 409 גם על dismiss ועל resolve_task. הודעה ברורה, לא שגיאה כללית.
    if (r.status === 409 && r.code === "use_mark_stopped") {
      return NextResponse.json({ error: USE_MARK_STOPPED_TEXT, code: r.code }, { status: 409 });
    }
    if (r.status === 409 && r.code === "use_mark_old_stopped") {
      return NextResponse.json({ error: USE_MARK_OLD_STOPPED_TEXT, code: r.code }, { status: 409 });
    }
    if (r.status === 409 && r.code === "system_task") {
      return NextResponse.json({ error: SYSTEM_TASK_TEXT, code: r.code }, { status: 409 });
    }
    // 400 (תיעוד קצר) / 409 (סוג או מצב לא מתאים) — עניינית, עוברת כמו שהיא. כל השאר (חיבור, חתימה) — כפי ש-callBloc אמר.
    return NextResponse.json({ error: r.error, ...(r.code ? { code: r.code } : {}) }, { status: r.status });
  }
  const result = r.data.result === "already" ? "already" : "processed";

  await auditLog(g.session, body.action === "done" ? "BILLING_TASK_DONE" : "BILLING_TASK_DISMISSED", "billing_task", body.task_id, {
    kind: body.kind, result, note: body.note, actor_email: g.session.email,
  });
  return NextResponse.json({ ok: true, result });
}
