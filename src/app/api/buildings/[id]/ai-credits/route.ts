// src/app/api/buildings/[id]/ai-credits/route.ts — קרדיטים ל-AI במתנה לבניין (bloc AI-1, SQL 173; PANEL-PAY א1, C2).
//
// סופר-אדמין בלבד, עם אישור בקוד (step-up, החלטה 364): קרדיט הוא עלות אמיתית של bloc (OpenAI). הפאנל לא קורא יותר ל-RPC
// בעצמו: הבקשה נחתמת ונשלחת ל-bloc (/api/internal/ai-credits), שמריץ את אותו ai_topup_grant (אותם פרמטרים: הבניין, כמה,
// לכמה חודשים, מי — המייל של המנהל — ולמה), ורושם ביומן שלו. תוספת פעילה מיד, בתוקף החודשים שנבחרו, אחרי המכסה החודשית.
// יומן הפאנל: AI_CREDITS_GRANT עם מספר ההזמנה של bloc; כשל — MONEY_ACTION_FAILED / MONEY_ACTION_UNKNOWN.
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { callBloc } from "@/lib/blocApi";
import { requireStepUp } from "@/lib/stepUp";
import { parseBody, aiGrantSchema } from "@/lib/validation";
import { actorOf, badShape, failureAudit, firstIp, moneyFailure } from "@/lib/moneyActions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard({ role: "superadmin" });
  if (!g.ok) return g.response;
  const session = g.session;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "מזהה בניין לא תקין", code: "invalid" }, { status: 400 });

  const parsed = await parseBody(req, aiGrantSchema);
  if (!parsed.ok) return parsed.response;
  const su = requireStepUp(session, req);
  if (!su.ok) return su.response;
  const { units, months, note } = parsed.data;
  const ip = firstIp(req.headers.get("x-forwarded-for"));

  const r = await callBloc("/api/internal/ai-credits", { actor: actorOf(session), building_id: id, units, months, note });
  if (!r.ok) {
    const a = failureAudit(r, "AI_CREDITS_GRANT");
    await auditLog(session, a.name, "building", id, { ...a.meta, units, months, note }, ip);
    const f = moneyFailure(r, "ai_credits");
    return NextResponse.json({ error: f.error, code: f.code }, { status: f.status });
  }

  // סקירה #6: הצלחה רק עם ok === true (מספר ההזמנה יכול להיות null) — אחרת "ייתכן שבוצע".
  if (r.data.ok !== true) {
    const b = badShape("AI_CREDITS_GRANT");
    await auditLog(session, b.audit.name, "building", id, { ...b.audit.meta, units, months, note }, ip);
    return NextResponse.json({ error: b.error, code: b.code }, { status: b.status });
  }
  const orderId = typeof r.data.id === "string" ? r.data.id : typeof r.data.order_id === "string" ? r.data.order_id : null;
  await auditLog(session, "AI_CREDITS_GRANT", "building", id, { units, months, note, order_id: orderId }, ip);
  return NextResponse.json({ ok: true, id: orderId });
}
